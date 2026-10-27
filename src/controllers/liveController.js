import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { getRazorpay, isPaymentsEnabled, verifySignature } from '../config/razorpay.js';
import { LiveClass } from '../models/LiveClass.js';
import { LiveRegistration } from '../models/LiveRegistration.js';

/**
 * Public landing page for one live class.
 * @route GET /api/live/:slug
 */
export const getLiveClass = asyncHandler(async (req, res) => {
  const cls = await LiveClass.findOne({ slug: req.params.slug.toLowerCase(), active: true });
  if (!cls) throw ApiError.notFound('This class is not available.');
  ok(res, { class: cls.toPublic(), paymentsEnabled: isPaymentsEnabled() });
});

/**
 * Register for a class (captures the lead) and open a payment order.
 * @route POST /api/live/:slug/register   (public)
 * body: { name, email, phone, slotId }
 */
export const registerForLiveClass = asyncHandler(async (req, res) => {
  const { name, email, phone, slotId } = req.body;
  if (!name || !email || !phone) throw ApiError.badRequest('Name, email and phone are required.');

  const cls = await LiveClass.findOne({ slug: req.params.slug.toLowerCase(), active: true });
  if (!cls) throw ApiError.notFound('This class is not available.');

  // Resolve the chosen slot (if the class has slots, one must be picked).
  let slot = null;
  if ((cls.slots || []).some((s) => s.active)) {
    if (!slotId) throw ApiError.badRequest('Please choose a batch/slot.');
    slot = cls.slots.id(slotId);
    if (!slot || !slot.active) throw ApiError.badRequest('That batch is no longer available.');
  }

  const registration = await LiveRegistration.create({
    liveClass: cls._id,
    classSlug: cls.slug,
    classTitle: cls.title,
    slotId: slot?._id || null,
    slotDate: slot?.date || '',
    slotTime: slot?.time || '',
    name: String(name).trim(),
    email: String(email).toLowerCase().trim(),
    phone: String(phone).trim(),
    amount: cls.price,
    currency: cls.currency || 'INR',
    paymentStatus: 'pending',
  });

  // Free class, or payments not switched on yet → the lead is saved, no order.
  if (!cls.price || cls.price < 1 || !isPaymentsEnabled()) {
    return ok(res, {
      registrationId: registration._id,
      paymentsEnabled: isPaymentsEnabled() && cls.price >= 1,
      order: null,
    }, 'Registered', 201);
  }

  const razorpay = await getRazorpay();
  const receipt = `live_${Date.now()}_${String(registration._id).slice(-6)}`;
  const rzpOrder = await razorpay.orders.create({
    amount: Math.round(cls.price * 100), // paise
    currency: cls.currency || 'INR',
    receipt,
    notes: {
      kind: 'live_class',
      classSlug: cls.slug,
      classTitle: cls.title,
      registrationId: String(registration._id),
      slot: slot?.date || '',
    },
  });

  registration.razorpayOrderId = rzpOrder.id;
  await registration.save();

  ok(res, {
    registrationId: registration._id,
    paymentsEnabled: true,
    order: {
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: env.razorpayKeyId,
    },
    prefill: { name: registration.name, email: registration.email, contact: registration.phone },
    classTitle: cls.title,
  }, 'Registered — complete payment to confirm your seat', 201);
});

/**
 * Verify a Razorpay payment for a live-class registration.
 * @route POST /api/live/:slug/verify   (public)
 * body: { registrationId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
export const verifyLiveClassPayment = asyncHandler(async (req, res) => {
  const { registrationId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!registrationId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw ApiError.badRequest('Missing payment verification fields.');
  }

  const registration = await LiveRegistration.findOne({ _id: registrationId, razorpayOrderId });
  if (!registration) throw ApiError.notFound('Registration not found.');

  const valid = verifySignature({ orderId: razorpayOrderId, paymentId: razorpayPaymentId, signature: razorpaySignature });
  if (!valid) {
    registration.paymentStatus = 'failed';
    await registration.save();
    throw ApiError.badRequest('Payment verification failed — signature mismatch.');
  }

  registration.paymentStatus = 'paid';
  registration.paidAt = registration.paidAt || new Date();
  registration.razorpayPaymentId = razorpayPaymentId;
  registration.razorpaySignature = razorpaySignature;

  // Best-effort: how they paid (the browser handler only returns ids).
  try {
    const rz = await getRazorpay();
    const p = await rz.payments.fetch(razorpayPaymentId);
    registration.method = p?.method || '';
    registration.methodDetail = p?.method === 'upi' ? (p.vpa || 'UPI')
      : p?.method === 'card' ? [p.card?.network, p.card?.last4 && `•••• ${p.card.last4}`].filter(Boolean).join(' ')
      : p?.method === 'netbanking' ? (p.bank || 'Net banking')
      : p?.method === 'wallet' ? (p.wallet || 'Wallet') : '';
  } catch (e) {
    console.warn('[live] could not fetch payment method:', e.message);
  }
  await registration.save();

  ok(res, { registrationId: registration._id, status: 'paid' }, 'Payment successful — your seat is confirmed!');
});
