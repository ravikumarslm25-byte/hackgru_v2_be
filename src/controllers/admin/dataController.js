import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { User } from '../../models/User.js';
import { Batch } from '../../models/org/Batch.js';
import { College } from '../../models/org/College.js';
import { RegistrationLink } from '../../models/org/RegistrationLink.js';
import { Order } from '../../models/Order.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Course } from '../../models/Course.js';
import { Lead } from '../../models/Lead.js';

/**
 * Admin sees EVERYTHING — no scoping. That's the whole difference from the
 * college portal, which can only read through collegeRepository.
 */

// @route GET /api/admin/students
export const listStudents = asyncHandler(async (req, res) => {
  const { q, college, department, batch, source, page = 1, limit = 25 } = req.query;
  const filter = { role: 'student' };
  if (college) filter.college = college;
  if (department) filter.department = department;
  if (source) filter.registrationSource = source;
  if (q) filter.$or = [
    { name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') },
    { registerNumber: new RegExp(q, 'i') }, { phone: new RegExp(q, 'i') },
  ];

  // Filtering by batch means "has an enrolment in this batch".
  if (batch) {
    const ids = await Enrollment.find({ batch }).distinct('student');
    filter._id = { $in: ids };
  }

  const [students, total] = await Promise.all([
    User.find(filter)
      .select('name email phone registerNumber year college department registrationSource institution createdAt isActive')
      .populate('college', 'name code').populate('department', 'name code')
      .sort('-createdAt').skip((page - 1) * limit).limit(Number(limit)).lean(),
    User.countDocuments(filter),
  ]);

  ok(res, { students, total, page: Number(page), pages: Math.ceil(total / limit) });
});

// @route GET /api/admin/students/:id
export const getStudent = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' })
    .populate('college', 'name code').populate('department', 'name code')
    .populate('registrationLink', 'token label').lean();
  if (!student) throw ApiError.notFound('Student not found');

  const [enrolments, orders] = await Promise.all([
    Enrollment.find({ student: student._id })
      .populate('course', 'title slug').populate('batch', 'name code').lean(),
    Order.find({ student: student._id }).populate('course', 'title').sort('-createdAt').lean(),
  ]);
  ok(res, { student, enrolments, orders });
});

// @route GET /api/admin/batches
export const listBatches = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.college) filter.college = req.query.college;
  if (req.query.course) filter.course = req.query.course;
  if (req.query.status) filter.status = req.query.status;
  const batches = await Batch.find(filter)
    .populate('college', 'name code').populate('department', 'name code').populate('course', 'title slug price')
    .sort('-createdAt').lean();
  // Real occupancy = students with access (paid online OR college-enrolled), computed
  // from enrolments so sponsored batches don't read as empty.
  const ids = batches.map((b) => b._id);
  const counts = await Enrollment.aggregate([
    { $match: { batch: { $in: ids } } },
    { $group: { _id: '$batch',
      registered: { $sum: 1 },
      active: { $sum: { $cond: [{ $or: ['$paid', '$sponsored'] }, 1, 0] } } } },
  ]);
  const cmap = Object.fromEntries(counts.map((c) => [String(c._id), c]));
  for (const b of batches) {
    const c = cmap[String(b._id)] || {};
    b.activeCount = c.active || 0;
    b.registeredCount = c.registered || 0;
  }
  ok(res, { batches });
});

/**
 * @route GET /api/admin/batches/:id
 * The batch roster: everything about who's in it and how they paid.
 * Filters: ?payment=paid|pending  ?from=ISO  ?to=ISO
 */
export const getBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id)
    .populate('college', 'name code').populate('department', 'name code').populate('course', 'title slug price');
  if (!batch) throw ApiError.notFound('Batch not found');

  const filter = { batch: batch._id };
  if (req.query.payment === 'paid') filter.paid = true;
  if (req.query.payment === 'pending') filter.paid = false;
  if (req.query.from || req.query.to) {
    filter.createdAt = {};
    if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
    // `to` is a date, not an instant — include the whole day.
    if (req.query.to) filter.createdAt.$lte = new Date(new Date(req.query.to).setHours(23, 59, 59, 999));
  }

  const enrolments = await Enrollment.find(filter)
    .populate('student', 'name email phone registerNumber year isActive')
    .sort({ paid: -1, createdAt: -1 })
    .lean();

  // The order carries the payment mode and the amount actually charged, which
  // may differ from the course's list price if the college negotiated.
  const orders = await Order.find({ batch: batch._id })
    .select('student status amount method methodDetail razorpayPaymentId createdAt updatedAt')
    .sort('-createdAt').lean();
  const byStudent = {};
  for (const o of orders) {
    const k = String(o.student);
    // Keep the paid one if there is one; otherwise the most recent attempt.
    if (!byStudent[k] || (o.status === 'paid' && byStudent[k].status !== 'paid')) byStudent[k] = o;
  }

  const roster = enrolments.map((e) => {
    const o = byStudent[String(e.student?._id)];
    return {
      id: e._id,
      student: e.student,
      registeredAt: e.createdAt,
      paid: Boolean(e.paid),
      sponsored: Boolean(e.sponsored),
      paidAt: e.paidAt || (o?.status === 'paid' ? o.updatedAt : null),
      payment: o ? {
        status: o.status, amount: o.amount,
        method: o.method || '', methodDetail: o.methodDetail || '',
        reference: o.razorpayPaymentId || '',
      } : null,
    };
  });

  const link = await RegistrationLink.findOne({ batch: batch._id }).lean();
  const freeAccess = Boolean(link?.freeAccess) || roster.some((r) => r.sponsored);
  ok(res, {
    batch, link, roster, freeAccess,
    totals: {
      registered: roster.length,
      // "active" = has access: either paid online, or college-enrolled (sponsored).
      active: roster.filter((r) => r.paid || r.sponsored).length,
      paid: roster.filter((r) => r.paid).length,
      sponsored: roster.filter((r) => r.sponsored).length,
      // "pending" is only a real unpaid seat — never a college-enrolled student.
      pending: roster.filter((r) => !r.paid && !r.sponsored).length,
      collected: roster.filter((r) => r.paid).reduce((s2, r) => s2 + (r.payment?.amount || 0), 0),
    },
  });
});

// @route GET /api/admin/orders
export const listOrders = asyncHandler(async (req, res) => {
  const { status, college, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (college) {
    const batchIds = await Batch.find({ college }).distinct('_id');
    filter.batch = { $in: batchIds };
  }
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('student', 'name email registerNumber').populate('course', 'title')
      .populate('batch', 'name code')
      .sort('-createdAt').skip((page - 1) * limit).limit(Number(limit)).lean(),
    Order.countDocuments(filter),
  ]);
  const paid = await Order.aggregate([
    { $match: { ...filter, status: 'paid' } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  ok(res, {
    orders, total, page: Number(page), pages: Math.ceil(total / limit),
    collected: paid[0]?.total || 0, paidCount: paid[0]?.count || 0,
  });
});

// @route GET /api/admin/dashboard
export const dashboard = asyncHandler(async (_req, res) => {
  const [
    students, linkStudents, colleges, batches, activeBatches,
    courses, enrolments, leads, paid, pending, overCapacity,
  ] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    User.countDocuments({ role: 'student', registrationSource: 'link' }),
    College.countDocuments({ isActive: true }),
    Batch.countDocuments(),
    Batch.countDocuments({ status: { $in: ['open', 'running'] } }),
    Course.countDocuments({ isPublished: true }),
    Enrollment.countDocuments(),
    Lead.countDocuments({ status: 'new' }),
    Order.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amount' }, n: { $sum: 1 } } }]),
    Order.countDocuments({ status: 'created' }),
    Batch.countDocuments({ overCapacity: true }),
  ]);

  // Revenue by month, last 6 — for the trend chart
  const since = new Date(); since.setMonth(since.getMonth() - 5); since.setDate(1);
  const trend = await Order.aggregate([
    { $match: { status: 'paid', createdAt: { $gte: since } } },
    { $group: { _id: { y: { $year: '$createdAt' }, m: { $month: '$createdAt' } }, total: { $sum: '$amount' }, n: { $sum: 1 } } },
    { $sort: { '_id.y': 1, '_id.m': 1 } },
  ]);

  const recentStudents = await User.find({ role: 'student' })
    .select('name email registerNumber createdAt registrationSource')
    .populate('college', 'code').sort('-createdAt').limit(5).lean();

  const recentOrders = await Order.find({ status: 'paid' })
    .select('amount createdAt').populate('student', 'name').populate('course', 'title')
    .sort('-createdAt').limit(5).lean();

  ok(res, {
    stats: {
      students, linkStudents, websiteStudents: students - linkStudents,
      colleges, batches, activeBatches, courses, enrolments, leads,
      collected: paid[0]?.total || 0, paidCount: paid[0]?.n || 0,
      pendingOrders: pending, overCapacityBatches: overCapacity,
    },
    trend: trend.map((t) => ({ label: `${t._id.y}-${String(t._id.m).padStart(2, '0')}`, total: t.total, count: t.n })),
    recentStudents, recentOrders,
  });
});
