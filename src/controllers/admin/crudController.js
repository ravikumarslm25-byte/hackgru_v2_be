import crypto from 'crypto';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { User } from '../../models/User.js';
import { College } from '../../models/org/College.js';
import { Department } from '../../models/org/Department.js';
import { Batch } from '../../models/org/Batch.js';
import { RegistrationLink } from '../../models/org/RegistrationLink.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Order } from '../../models/Order.js';

/**
 * Edit and delete across the admin panel.
 *
 * ON DELETE — the rule applied throughout:
 *   Nothing that money touches gets hard-deleted.
 *
 * Deleting a student who has paid orphans their orders: your revenue reports
 * stop reconciling, and if they dispute a charge you have no record. Same for a
 * college whose batches hold paid students.
 *
 * So: hard delete only when there are no dependents. Otherwise deactivate, and
 * SAY SO with the count — never silently do something different from what the
 * button promised.
 */

/* ─────────────────────────── students ─────────────────────────── */

// @route PUT /api/admin/students/:id
export const updateStudent = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) throw ApiError.notFound('Student not found');

  const allowed = ['name', 'phone', 'year', 'registerNumber', 'institution', 'bio', 'track', 'isActive'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) student[f] = req.body[f]; });

  // Moving a student between colleges changes who can see them. Allowed, but
  // deliberately — it isn't part of the ordinary edit form.
  if (req.body.college !== undefined && String(req.body.college || '') !== String(student.college || '')) {
    if (req.body.college) {
      const dept = await Department.findOne({ _id: req.body.department, college: req.body.college });
      if (!dept) throw ApiError.badRequest('Pick a department that belongs to that college.');
      student.college = req.body.college;
      student.department = req.body.department;
      student.registrationSource = 'admin';
    } else {
      // Unlinking hides them from that college's portal from this moment on.
      student.college = null;
      student.department = null;
    }
  }

  await student.save();
  ok(res, { student: { id: student._id, name: student.name, email: student.email } }, 'Student updated');
});

// @route DELETE /api/admin/students/:id
export const deleteStudent = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) throw ApiError.notFound('Student not found');

  const [paid, enrolments] = await Promise.all([
    Order.countDocuments({ student: student._id, status: 'paid' }),
    Enrollment.countDocuments({ student: student._id }),
  ]);

  if (paid > 0) {
    // Refuse. Deleting them destroys the record behind money you have taken.
    if (!req.query.deactivate) {
      throw ApiError.badRequest(
        `${student.name} has ${paid} paid order${paid === 1 ? '' : 's'}. Deleting the account would ` +
        'orphan those payments — your revenue reports would stop reconciling, and you would have no ' +
        'record if the charge is ever disputed. Deactivate the account instead: they can no longer ' +
        'log in, and everything stays auditable.'
      );
    }
    student.isActive = false;
    await student.save();
    return ok(res, { deactivated: true }, `${student.name} deactivated. ${paid} payment record(s) kept.`);
  }

  // No money involved — safe to remove properly.
  await Enrollment.deleteMany({ student: student._id });
  await Order.deleteMany({ student: student._id });
  await student.deleteOne();
  ok(res, { deleted: true }, `${student.name} deleted (${enrolments} enrolment(s) removed, no payments involved).`);
});

const _tempPassword = () => crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || ('Hg' + Date.now().toString(36));

// @route POST /api/admin/students/:id/reset-password   { password? }
// Generates a temp password, or sets a custom one (>=6 chars). Returns it once so
// the admin can share it; the student can change it after signing in.
export const resetStudentPassword = asyncHandler(async (req, res) => {
  const student = await User.findOne({ _id: req.params.id, role: 'student' });
  if (!student) throw ApiError.notFound('Student not found');
  const custom = req.body.password ? String(req.body.password) : '';
  if (custom && custom.length < 6) throw ApiError.badRequest('Password must be at least 6 characters.');
  const password = custom || _tempPassword();
  student.password = password;   // hashed by the model pre-save hook
  await student.save();
  ok(res, { password, custom: Boolean(custom) }, 'Password reset');
});

/* ─────────────────────────── colleges ─────────────────────────── */

// @route DELETE /api/admin/colleges/:id/hard
export const deleteCollege = asyncHandler(async (req, res) => {
  const college = await College.findById(req.params.id);
  if (!college) throw ApiError.notFound('College not found');

  const [students, batches, depts] = await Promise.all([
    User.countDocuments({ college: college._id }),
    Batch.countDocuments({ college: college._id }),
    Department.countDocuments({ college: college._id }),
  ]);

  if (students > 0 || batches > 0) {
    throw ApiError.badRequest(
      `${college.name} has ${students} student${students === 1 ? '' : 's'} and ${batches} batch${batches === 1 ? '' : 'es'}. ` +
      'Deleting it would break their records and any payments attached. Deactivate it instead — it ' +
      'disappears from new registration links but everything stays intact.'
    );
  }

  await Department.deleteMany({ college: college._id });
  await User.deleteMany({ role: 'spoc', 'spocAccess.college': college._id });
  await college.deleteOne();
  ok(res, {}, `${college.name} deleted (${depts} department(s) and its staff logins removed).`);
});

// @route PATCH /api/admin/colleges/:id/activate
export const setCollegeActive = asyncHandler(async (req, res) => {
  const college = await College.findById(req.params.id);
  if (!college) throw ApiError.notFound('College not found');
  college.isActive = Boolean(req.body.isActive);
  await college.save();
  ok(res, { college }, college.isActive ? 'College reactivated.' : 'College deactivated.');
});

/* ────────────────────────── departments ───────────────────────── */

// @route DELETE /api/admin/departments/:id
export const deleteDepartment = asyncHandler(async (req, res) => {
  const dept = await Department.findById(req.params.id);
  if (!dept) throw ApiError.notFound('Department not found');

  const [batches, students] = await Promise.all([
    Batch.countDocuments({ department: dept._id }),
    User.countDocuments({ department: dept._id }),
  ]);
  if (batches > 0 || students > 0) {
    throw ApiError.badRequest(
      `${dept.name} has ${batches} batch(es) and ${students} student(s). Removing it would leave them ` +
      'pointing at a department that no longer exists. Mark it inactive instead.'
    );
  }
  await dept.deleteOne();
  ok(res, {}, `${dept.name} deleted.`);
});

/* ──────────────────────────── batches ─────────────────────────── */

// @route PUT /api/admin/batches/:id
export const updateBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw ApiError.notFound('Batch not found');

  const allowed = ['name', 'academicYear', 'startDate', 'endDate', 'status', 'notes', 'seats'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) batch[f] = req.body[f]; });

  if (req.body.seats !== undefined) {
    const paid = batch.stats?.paid || 0;
    if (req.body.seats < paid) {
      throw ApiError.badRequest(
        `${paid} student(s) have already paid for this batch — the seat count can't be lower than that.`
      );
    }
    // Raising the cap is how you resolve an over-capacity batch.
    if (batch.overCapacity && req.body.seats > paid) {
      batch.overCapacity = false;
      await RegistrationLink.updateOne({ batch: batch._id }, { maxSeats: req.body.seats });
    }
  }
  await batch.save();
  ok(res, { batch }, 'Batch updated');
});

// @route DELETE /api/admin/batches/:id
export const deleteBatch = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id);
  if (!batch) throw ApiError.notFound('Batch not found');

  const enrolled = await Enrollment.countDocuments({ batch: batch._id });
  if (enrolled > 0) {
    throw ApiError.badRequest(
      `${enrolled} student(s) are enrolled in this batch. Deleting it would detach them from their ` +
      'college — they would vanish from the college portal while keeping their course. ' +
      'Set the batch to "cancelled" instead.'
    );
  }
  await RegistrationLink.deleteMany({ batch: batch._id });
  await batch.deleteOne();
  ok(res, {}, 'Batch and its registration link deleted.');
});
