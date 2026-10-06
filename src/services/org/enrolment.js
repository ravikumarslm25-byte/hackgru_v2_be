import { Enrollment } from '../../models/Enrollment.js';
import { Batch } from '../../models/org/Batch.js';
import { RegistrationLink } from '../../models/org/RegistrationLink.js';
import { User } from '../../models/User.js';
import { Course } from '../../models/Course.js';
import { sendPaymentConfirmation } from '../email/index.js';
import { notifyUser, notifyAdmins } from '../notify.js';
import { grantEntitlement } from '../access/entitlements.js';

/**
 * Email the student their receipt — exactly once per order.
 *
 * grantAccessForOrder is idempotent and can run several times for one payment
 * (browser verify + webhook + retries), so the send is guarded by a persisted
 * flag. Never throws: a mail failure must not undo a paid enrolment.
 */
async function emailReceiptOnce(order) {
  if (order.confirmationEmailSentAt) return;
  try {
    const [student, course] = await Promise.all([
      User.findById(order.student).select('name email').lean(),
      order.course ? Course.findById(order.course).select('title').lean() : null,
    ]);
    if (!student?.email) return;
    // Mark first so a slow/duplicate call can't double-send.
    order.confirmationEmailSentAt = new Date();
    await order.save();
    await sendPaymentConfirmation({
      to: student.email,
      name: student.name,
      courseTitle: course?.title,
      amount: order.amount,
      currency: order.currency,
      paymentId: order.razorpayPaymentId,
      method: order.methodDetail || order.method,
    });
    notifyUser(order.student, { type: 'payment_success', title: 'Payment confirmed', body: `Your payment${course?.title ? ` for ${course.title}` : ''} is confirmed. Your enrolment is active.`, link: '/dashboard/courses' });
    notifyAdmins({ type: 'payment_success', title: 'Payment received', body: `${student.name} paid ₹${order.amount}${course?.title ? ` for ${course.title}` : ''}.`, link: '/admin/payments' });
  } catch (err) {
    console.error(`[enrol] receipt email failed for order ${order._id}: ${err.message}`);
  }
}

/**
 * Turn a paid order into course access. The ONLY place that does this.
 *
 * Both routes to a paid order call it:
 *   • /api/payments/verify   — the browser came back
 *   • the Razorpay webhook   — the browser didn't
 *
 * They used to create enrolments independently, which is how the two drift apart
 * and one of them forgets the batch — putting a student in the course but not in
 * their college's portal.
 *
 * Idempotent: Razorpay retries, and both paths can fire for the same payment.
 */
export async function grantAccessForOrder(order, reason = 'payment') {
  // 1. Mark it paid.
  //
  // For a link registration the enrolment already exists (created at /join, so
  // an abandoned checkout still leaves the student in their batch). For a public
  // website purchase there's nothing yet, so upsert covers both.
  //
  // $set is idempotent; $setOnInsert protects an existing row's batch and
  // progress from being reset by a webhook replay.
  const enrollment = await Enrollment.findOneAndUpdate(
    { student: order.student, course: order.course },
    {
      $set: { paid: true, paidAt: new Date() },
      $setOnInsert: {
        student: order.student,
        course: order.course,
        batch: order.batch || null,
        registrationLink: order.registrationLink || null,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // 2. Seat. Only for link registrations, and only once per order.
  if (order.registrationLink && !order.seatClaimed) {
    await claimSeat(order);
  }

  // 2b. ENTITLEMENT — the v2 access spine. A paid course order grants live_cohort
  // access. Idempotent; never throws (access must survive a mail/notify hiccup).
  try {
    await grantEntitlement({
      student: order.student,
      kind: 'live_cohort',
      course: order.course,
      batch: order.batch || null,
      source: order.registrationLink ? 'college_link' : 'purchase',
      order: order._id,
    });
  } catch (err) {
    console.error('[enrol] entitlement grant failed (non-fatal):', err.message);
  }

  console.log(`[enrol] ${order.student} → course ${order.course}` +
              `${order.batch ? ` · batch ${order.batch}` : ''} (${reason})`);

  // Receipt email — once, non-blocking, never throws.
  await emailReceiptOnce(order);

  return enrollment;
}

/**
 * Claim one seat, atomically.
 *
 * The condition and the increment are a single document update, so two students
 * paying for the last seat at the same instant cannot both take it.
 *
 * IF THE CLAIM FAILS, WE STILL ENROL THEM. The money is already taken — refusing
 * access at this point is the worst possible outcome for a student who did
 * nothing wrong. The batch is flagged over-capacity instead, so an admin can
 * decide: add a seat, or refund deliberately. A quiet oversell beats an angry
 * student with a receipt and no course.
 */
async function claimSeat(order) {
  const claimed = await RegistrationLink.findOneAndUpdate(
    { _id: order.registrationLink, $expr: { $lt: ['$usedSeats', '$maxSeats'] } },
    { $inc: { usedSeats: 1 } },
    { new: true }
  );

  order.seatClaimed = true;
  await order.save();

  if (claimed) {
    await Batch.updateOne({ _id: order.batch }, { $inc: { 'stats.paid': 1 } });
    return { ok: true, seatsLeft: claimed.maxSeats - claimed.usedSeats };
  }

  // Oversold.
  await Batch.updateOne({ _id: order.batch }, {
    $inc: { 'stats.paid': 1 },
    $set: { overCapacity: true },
  });
  console.error(
    `[enrol] ⚠ BATCH OVER CAPACITY — order ${order.razorpayOrderId} was paid after the last seat went.\n` +
    `        Student ${order.student} has been enrolled anyway (they paid).\n` +
    `        Batch ${order.batch} is flagged — add a seat or refund deliberately.`
  );
  return { ok: false, overCapacity: true };
}
