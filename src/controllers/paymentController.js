import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { getRazorpay, isPaymentsEnabled, verifySignature } from '../config/razorpay.js';
import { Order } from '../models/Order.js';
import { Course } from '../models/Course.js';
import { Enrollment } from '../models/Enrollment.js';
import { CoursePrice } from '../models/org/CoursePrice.js';
import { grantAccessForOrder } from '../services/org/enrolment.js';

// @route GET /api/payments/config  — lets the client know if checkout is live
export const getPaymentConfig = asyncHandler(async (_req, res) => {
  ok(res, { enabled: isPaymentsEnabled(), keyId: env.razorpayKeyId || null });
});

// @route POST /api/payments/order  { courseId }
export const createOrder = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  // An unpaid enrolment is exactly what this endpoint is for — resuming a
  // checkout the student abandoned. Only a PAID one is a real conflict.
  const already = await Enrollment.findOne({ student: req.user._id, course: course._id });
  if (already?.paid) throw ApiError.conflict('You are already enrolled in this course');

  if (!isPaymentsEnabled()) {
    throw new ApiError(503, 'Payments are not configured yet. Add your Razorpay keys to the server .env file.');
  }

  const razorpay = await getRazorpay();
  const receipt = `rcpt_${Date.now()}_${String(req.user._id).slice(-6)}`;

  // Resuming? Keep the batch and link, or the student pays and still isn't
  // placed in their college's cohort. Also honour their college's price.
  const batch = already?.batch || null;
  const registrationLink = already?.registrationLink || null;
  const { price: amount } = await CoursePrice.resolve({
    courseId: course._id,
    collegeId: req.user.college,
    coursePrice: course.price,
    linkOverride: null,
  });

  const rzpOrder = await razorpay.orders.create({
    amount: amount * 100, // paise
    currency: course.currency || 'INR',
    receipt,
    notes: {
      courseId: String(course._id), courseTitle: course.title, studentId: String(req.user._id),
      ...(batch ? { batchId: String(batch) } : {}),
    },
  });

  const order = await Order.create({
    student: req.user._id,
    course: course._id,
    batch,
    registrationLink,
    amount,
    currency: course.currency || 'INR',
    razorpayOrderId: rzpOrder.id,
    receipt,
    notes: rzpOrder.notes,
  });

  ok(res, {
    order: {
      id: order._id,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: env.razorpayKeyId,
    },
    course: { id: course._id, title: course.title, price: amount },
  }, 'Order created', 201);
});

// @route POST /api/payments/verify  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw ApiError.badRequest('Missing payment verification fields');
  }

  const order = await Order.findOne({ razorpayOrderId, student: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');

  const valid = verifySignature({ orderId: razorpayOrderId, paymentId: razorpayPaymentId, signature: razorpaySignature });
  if (!valid) {
    order.status = 'failed';
    await order.save();
    throw ApiError.badRequest('Payment verification failed — signature mismatch');
  }

  order.status = 'paid';
  order.razorpayPaymentId = razorpayPaymentId;
  order.razorpaySignature = razorpaySignature;

  // The browser handler only hands back ids, so ask Razorpay how they paid.
  // Best-effort: the webhook fills this in too, and a failure here must never
  // block access to a course someone has paid for.
  try {
    const rz = await getRazorpay();
    const p = await rz.payments.fetch(razorpayPaymentId);
    order.method = p?.method || '';
    order.methodDetail = p?.method === 'upi' ? (p.vpa || 'UPI')
      : p?.method === 'card' ? [p.card?.network, p.card?.last4 && `•••• ${p.card.last4}`].filter(Boolean).join(' ')
      : p?.method === 'netbanking' ? (p.bank || 'Net banking')
      : p?.method === 'wallet' ? (p.wallet || 'Wallet') : '';
  } catch (e) {
    console.warn('[payments] could not fetch payment method:', e.message);
  }
  await order.save();

  // One shared path with the webhook — so a link purchase always carries its batch.
  const enrollment = await grantAccessForOrder(order, 'browser verify');

  ok(res, { order, enrollment }, 'Payment successful — you are enrolled!');
});

// @route GET /api/payments/me — order history
export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ student: req.user._id })
    .populate('course', 'title slug price')
    .sort('-createdAt');
  ok(res, { orders });
});
