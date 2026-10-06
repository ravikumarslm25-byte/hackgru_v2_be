import { User } from '../../models/User.js';
import { Batch } from '../../models/org/Batch.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Order } from '../../models/Order.js';
import { Result } from '../../models/ssat/Result.js';

/**
 * The ONLY way the college portal reads data.
 *
 * Rule: college controllers must never import a model directly. They take a
 * scope from buildCollegeScope and call these methods. There's a test that
 * enforces it (src/tests/collegeIsolation.test.mjs).
 *
 * Why a repository rather than "just remember to filter": one controller doing
 * `User.find({ role: 'student' })` and forgetting the scope hands a SPOC every
 * student on the platform. That's the bug that ends a college relationship. Here
 * the scope is ANDed at the bottom of every query and there is no argument that
 * can switch it off.
 */
export function collegeRepository(scope) {
  /**
   * Combine a caller's filter with the scope.
   * $and — not a spread — so a caller can't override the scope by passing the
   * same key, and can't widen it with a top-level $or.
   */
  const bounded = (filter = {}) => ({
    $and: [Object.keys(filter).length ? filter : {}, scope.studentFilter],
  });

  /** Strip anything this SPOC hasn't been granted. Applied to every student. */
  const projectStudent = (u) => {
    const out = {
      id: u._id,
      name: u.name,
      registerNumber: u.registerNumber,
      year: u.year,
      department: u.department,
      college: u.college,
      createdAt: u.createdAt,
      isActive: u.isActive,
    };
    if (scope.can('students:contact')) {
      out.email = u.email;
      out.phone = u.phone;
    }
    return out;
  };

  return {
    /* ───────────────────────── students ───────────────────────── */
    async students({ filter = {}, page = 1, limit = 25, sort = '-createdAt' } = {}) {
      scope.require('students:view');
      const q = bounded(filter);
      const [rows, total] = await Promise.all([
        User.find(q).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
        User.countDocuments(q),
      ]);
      return { students: rows.map(projectStudent), total, page, pages: Math.ceil(total / limit) };
    },

    async student(studentId) {
      scope.require('students:view');
      const u = await User.findOne(bounded({ _id: studentId })).lean();
      return u ? projectStudent(u) : null;
    },

    /** Does this student fall inside the scope? Guard for any nested lookup. */
    async owns(studentId) {
      return Boolean(await User.exists(bounded({ _id: studentId })));
    },

    /* ────────────────────────── batches ───────────────────────── */
    async batches({ filter = {} } = {}) {
      scope.require('batches:view');
      return Batch.find({ $and: [filter, { _id: { $in: scope.batchIds } }] })
        .populate('course', 'title slug')
        .populate('department', 'name code')
        .sort('-createdAt')
        .lean();
    },

    /**
     * One batch, with its full roster.
     *
     * Same shape as the admin's, minus anything this SPOC isn't granted. Returns
     * null for a batch outside the scope — the SAME as a batch that doesn't
     * exist, so this can't be used to probe what other colleges are running.
     */
    async batchRoster(batchId, { payment, from, to } = {}) {
      scope.require('batches:view');

      const owns = scope.batchIds.some((id) => String(id) === String(batchId));
      if (!owns) return null;

      const batch = await Batch.findById(batchId)
        .populate('department', 'name code')
        .populate('course', 'title slug durationWeeks schedule')
        .lean();
      if (!batch) return null;

      const filter = { batch: batchId };
      if (payment === 'paid') filter.paid = true;
      if (payment === 'pending') filter.paid = false;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(new Date(to).setHours(23, 59, 59, 999));
      }

      const enrolments = await Enrollment.find(filter)
        .populate('student', 'name email phone registerNumber year')
        .sort({ paid: -1, createdAt: -1 })
        .lean();

      // Orders carry the method and the amount actually charged.
      const orders = await Order.find({ batch: batchId })
        .select('student status amount method methodDetail updatedAt createdAt').lean();
      const byStudent = {};
      for (const o of orders) {
        const k = String(o.student);
        if (!byStudent[k] || (o.status === 'paid' && byStudent[k].status !== 'paid')) byStudent[k] = o;
      }

      const roster = enrolments.map((e) => {
        const o = byStudent[String(e.student?._id)];
        return {
          id: e._id,
          name: e.student?.name,
          registerNumber: e.student?.registerNumber || '',
          year: e.student?.year || '',
          // Contact details are a grant, not a given.
          ...(scope.can('students:contact')
            ? { email: e.student?.email, phone: e.student?.phone }
            : {}),
          registeredAt: e.createdAt,
          paid: Boolean(e.paid),
          paidAt: e.paidAt || (o?.status === 'paid' ? o.updatedAt : null),
          // A college may always see THAT a student settled, and how — the
          // AMOUNT is what payments:view controls, because it exposes the rate
          // we negotiated with them.
          method: o?.method || '',
          methodDetail: o?.methodDetail || '',
          ...(scope.can('payments:view') ? { amount: o?.amount } : {}),
        };
      });

      return {
        batch,
        roster,
        totals: {
          registered: roster.length,
          paid: roster.filter((r) => r.paid).length,
          pending: roster.filter((r) => !r.paid).length,
          ...(scope.can('payments:view')
            ? { collected: roster.filter((r) => r.paid).reduce((s2, r) => s2 + (r.amount || 0), 0) }
            : {}),
        },
        can: { contact: scope.can('students:contact'), amounts: scope.can('payments:view'), export: scope.can('export') },
      };
    },

    /* ───────────────────────── progress ───────────────────────── */
    async progressFor(studentId) {
      scope.require('progress:view');
      if (!(await this.owns(studentId))) return null;
      return Enrollment.find({ student: studentId, batch: { $in: scope.batchIds } })
        .populate('course', 'title slug totalLessons')
        // `paid` is a status, not an amount — a college may see THAT a student
        // has settled without seeing WHAT they paid (that needs payments:view).
        .select('course progress status lastAccessed completedLessons batch paid')
        .lean();
    },

    /* ─────────────────────────── SSAT ─────────────────────────── */
    /**
     * Ability scores only.
     *
     * The work-style and EQ sections are deliberately never returned, whatever
     * permissions a SPOC holds. Those are self-reflection instruments the student
     * answered for their own benefit and their mentor's coaching — not a
     * psychological profile for their college to read. Stripping it here rather
     * than trusting each caller means it can't leak by omission.
     */
    async ssatFor(studentId) {
      scope.require('ssat:view');
      if (!(await this.owns(studentId))) return null;
      return Result.find({ student: studentId })
        .select('dimensions subskills strengths weaknesses readiness goal takenAt -_id')
        .sort('-takenAt')
        .lean();
    },

    /* ───────────────────────── payments ───────────────────────── */
    /**
     * Payment status. Amounts appear ONLY with the `payments:view` permission,
     * which is off by default — it's financial data, and it exposes any
     * per-college pricing you negotiated.
     */
    async paymentsFor(studentId) {
      if (!(await this.owns(studentId))) return null;
      const orders = await Order.find({ student: studentId })
        .populate('course', 'title slug')
        .sort('-createdAt')
        .lean();
      return orders.map((o) => ({
        id: o._id,
        course: o.course,
        status: o.status,
        paidAt: o.status === 'paid' ? o.updatedAt : null,
        ...(scope.can('payments:view') ? { amount: o.amount, currency: o.currency, orderId: o.razorpayOrderId } : {}),
      }));
    },

    /* ──────────────────────── dashboard ───────────────────────── */
    async summary() {
      scope.require('students:view');
      const [students, batches, activeBatches] = await Promise.all([
        User.countDocuments(scope.studentFilter),
        Batch.countDocuments({ _id: { $in: scope.batchIds } }),
        Batch.countDocuments({ _id: { $in: scope.batchIds }, status: { $in: ['open', 'running'] } }),
      ]);
      const enrolments = await Enrollment.countDocuments({ batch: { $in: scope.batchIds } });
      const completed = await Enrollment.countDocuments({ batch: { $in: scope.batchIds }, status: 'completed' });
      return { students, batches, activeBatches, enrolments, completed };
    },
  };
}
