import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Order } from '../../models/Order.js';
import { Upload } from '../../models/Upload.js';
import { Entitlement } from '../../models/Entitlement.js';
import { RegistrationLink } from '../../models/org/RegistrationLink.js';
import { grantAccessForOrder } from '../../services/org/enrolment.js';

/**
 * Admin marks an enrolment as PAID for an off-platform payment (student paid to
 * the bank/UPI directly). Creates or completes the Order, records the method /
 * reference / optional proof, and grants course access through the same path a
 * Razorpay payment uses — so the seat, entitlement and receipt all line up.
 *
 * @route POST /api/admin/enrolments/:id/mark-paid
 * body: { amount?, method?, reference?, proofUploadId? }
 */
export const markEnrolmentPaid = asyncHandler(async (req, res) => {
  const enr = await Enrollment.findById(req.params.id).populate('course', 'title price');
  if (!enr) throw ApiError.notFound('Enrolment not found.');
  if (enr.paid) throw ApiError.badRequest('This enrolment is already marked paid.');
  if (!enr.course) throw ApiError.badRequest('This enrolment has no course attached.');

  const amount = Number(req.body.amount) > 0 ? Number(req.body.amount) : (enr.course.price || 0);
  const method = (req.body.method || 'Manual').toString().trim();
  const reference = (req.body.reference || '').toString().trim();

  // Optional proof: a ready payment-proof upload (uploaded by this admin or the student).
  let proof = null;
  if (req.body.proofUploadId) {
    const u = await Upload.findOne({ _id: req.body.proofUploadId, purpose: 'payment-proof', status: 'ready' }).lean();
    if (u) proof = u._id;
  }

  // Reuse an existing (non-refunded) order for this seat, else make one.
  let order = await Order.findOne({ student: enr.student, course: enr.course._id, status: { $ne: 'refunded' } }).sort('-createdAt');
  if (!order) {
    order = await Order.create({
      student: enr.student, course: enr.course._id, type: 'course',
      batch: enr.batch || null, registrationLink: enr.registrationLink || null,
      amount, currency: 'INR', status: 'created',
    });
  }
  order.status = 'paid';
  order.amount = amount;
  order.method = 'manual';
  order.methodDetail = method + (reference ? ` · ${reference}` : '');
  if (reference) order.razorpayPaymentId = reference;
  if (proof) order.proof = proof;
  order.manuallyMarkedBy = req.user._id;
  order.fulfilledAt = new Date();
  await order.save();

  // One shared path: sets enrolment.paid, grants the entitlement, claims the
  // seat (for link registrations) and emails the receipt — all idempotent.
  await grantAccessForOrder(order, `manual payment by admin ${req.user._id}`);

  const updated = await Enrollment.findById(enr._id).lean();
  ok(res, {
    paid: true,
    enrolment: { id: updated._id, paid: updated.paid, paidAt: updated.paidAt },
    order: { id: order._id, amount: order.amount, method: order.methodDetail },
  }, `Payment recorded — ${enr.course.title} access granted.`);
});

/**
 * Remove a student's enrolment from a batch/course (e.g. a duplicate seat). Deletes
 * the enrolment, revokes its entitlements and, if it was a paid link seat, frees
 * the seat. Paid enrolments require ?force=1 so money isn't silently voided; the
 * Order records are always kept for audit.
 *
 * @route DELETE /api/admin/enrolments/:id?force=1
 */
export const removeEnrolment = asyncHandler(async (req, res) => {
  const enr = await Enrollment.findById(req.params.id).populate('course', 'title');
  if (!enr) throw ApiError.notFound('Enrolment not found.');

  const force = req.query.force === '1' || req.query.force === 'true';
  if (enr.paid && !force) {
    throw ApiError.badRequest(
      `This student has PAID for ${enr.course?.title || 'this course'}. Removing them revokes access to ` +
      'something they paid for. If this is a genuine duplicate or mistake, confirm to proceed — the ' +
      'payment record is kept for your accounts.'
    );
  }

  // Free a link seat only if this was a paid seat that had claimed one.
  if (enr.registrationLink && enr.paid) {
    await RegistrationLink.updateOne({ _id: enr.registrationLink, usedSeats: { $gt: 0 } }, { $inc: { usedSeats: -1 } });
  }
  // Revoke this course's entitlements for the student (soft).
  await Entitlement.updateMany(
    { student: enr.student, course: enr.course?._id, active: true },
    { $set: { active: false, note: `removed from batch by admin ${req.user._id}` } }
  );
  // Clean up dangling unpaid orders for this seat (keep paid/refunded for audit).
  if (!enr.paid) {
    await Order.deleteMany({ student: enr.student, course: enr.course?._id, status: { $in: ['created', 'failed', 'cancelled'] } });
  }
  await Enrollment.deleteOne({ _id: enr._id });

  ok(res, { removed: true, wasPaid: enr.paid }, `Removed from ${enr.course?.title || 'the batch'}.`);
});
