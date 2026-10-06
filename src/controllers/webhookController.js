import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { verifyWebhook } from '../config/razorpay.js';
import { Order } from '../models/Order.js';
import { Enrollment } from '../models/Enrollment.js';
import { grantAccessForOrder } from '../services/org/enrolment.js';
import { fulfilCartOrder } from '../services/commerce/fulfilment.js';

/**
 * Razorpay webhook.
 *
 * WHY THIS EXISTS: /payments/verify is called by the BROWSER after checkout.
 * If the student's tab closes, their network drops, or the page crashes in that
 * moment, Razorpay has taken the money and no enrolment is ever created — the
 * student paid and got nothing. On Indian mobile networks that is not rare.
 *
 * This endpoint is called by Razorpay's servers directly, so it works even if
 * the browser never comes back. It is the source of truth for granting access;
 * /payments/verify just makes the UI feel instant.
 *
 * NOTES
 *  - Must be PUBLIC (Razorpay has no JWT). Security comes from the HMAC signature.
 *  - Must receive the RAW body — see app.js, it is mounted before express.json().
 *  - Must be IDEMPOTENT. Razorpay retries until it gets a 2xx, so the same event
 *    will arrive more than once.
 *  - Must return 2xx for anything it doesn't handle, or Razorpay retries forever.
 */

/** A human-readable payment method, from whatever Razorpay sent. */
function describeMethod(p = {}) {
  if (p.method === 'upi') return p.vpa || 'UPI';
  if (p.method === 'card') {
    const c = p.card || {};
    return [c.network, c.last4 && `•••• ${c.last4}`].filter(Boolean).join(' ') || 'Card';
  }
  if (p.method === 'netbanking') return p.bank || 'Net banking';
  if (p.method === 'wallet') return p.wallet || 'Wallet';
  return p.method || '';
}

/** Grant course access. Safe to call repeatedly. Shared with /payments/verify. */
const grantAccess = (order, reason) =>
  order.type === 'cart' ? fulfilCartOrder(order) : grantAccessForOrder(order, `webhook · ${reason}`);

const handlers = {
  /** The money actually arrived. This is the event that matters. */
  'payment.captured': async (payload) => {
    const payment = payload.payment?.entity;
    if (!payment?.order_id) return 'no order_id in payload';

    const order = await Order.findOne({ razorpayOrderId: payment.order_id });
    if (!order) return `no local order for ${payment.order_id}`;

    if (order.status === 'paid') {
      // Already handled — almost certainly /payments/verify got there first,
      // or this is a retry. Make sure access exists, then stop.
      await grantAccess(order, 'idempotent replay');
      return 'already paid';
    }

    order.status = 'paid';
    order.razorpayPaymentId = payment.id;
    order.method = payment.method || '';
    order.methodDetail = describeMethod(payment);
    await order.save();
    await grantAccess(order, 'webhook');
    return 'paid + enrolled';
  },

  'payment.failed': async (payload) => {
    const payment = payload.payment?.entity;
    if (!payment?.order_id) return 'no order_id';
    const order = await Order.findOne({ razorpayOrderId: payment.order_id });
    if (!order || order.status === 'paid') return 'ignored';
    order.status = 'failed';
    order.razorpayPaymentId = payment.id;
    await order.save();
    return 'marked failed';
  },

  /**
   * A refund went through. We pause access rather than delete the enrolment,
   * so the student's progress survives if it was a mistake or gets reversed.
   * Deliberately reversible — deleting data on an automated signal is how you
   * lose a student's work over a partial refund.
   */
  'refund.processed': async (payload) => {
    const refund = payload.refund?.entity;
    if (!refund?.payment_id) return 'no payment_id';
    const order = await Order.findOne({ razorpayPaymentId: refund.payment_id });
    if (!order) return `no local order for payment ${refund.payment_id}`;

    order.status = 'refunded';
    order.refund = {
      ...(order.refund || {}),
      processedAt: new Date(),
      amount: (refund.amount || 0) / 100,
      reason: refund.notes?.reason || 'refund processed via Razorpay',
    };
    await order.save();

    await Enrollment.updateOne(
      { student: order.student, course: order.course },
      { status: 'paused' }
    );
    console.log(`[webhook] refund processed — access paused for order ${order.razorpayOrderId}`);
    return 'refunded + access paused';
  },
};

// @route POST /api/payments/webhook   (public — called by Razorpay, not the browser)
export const handleWebhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));

  if (!env.razorpayWebhookSecret) {
    // Return 200 anyway: a 4xx makes Razorpay retry this for days.
    console.warn('[webhook] received, but RAZORPAY_WEBHOOK_SECRET is not set — ignoring. ' +
                 'Add it from Razorpay Dashboard → Settings → Webhooks.');
    return res.status(200).json({ received: true, handled: false, reason: 'not configured' });
  }

  if (!verifyWebhook(raw, signature)) {
    // A bad signature means it isn't Razorpay. Reject loudly.
    console.error('[webhook] SIGNATURE MISMATCH — request rejected');
    throw ApiError.badRequest('Invalid webhook signature');
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch {
    throw ApiError.badRequest('Webhook body is not valid JSON');
  }

  const handler = handlers[event.event];
  if (!handler) {
    // Unknown event — acknowledge so Razorpay stops retrying.
    return res.status(200).json({ received: true, handled: false, event: event.event });
  }

  try {
    const result = await handler(event.payload || {});
    console.log(`[webhook] ${event.event} → ${result}`);
    return res.status(200).json({ received: true, handled: true, event: event.event });
  } catch (err) {
    // Return 500 so Razorpay retries — a transient DB blip shouldn't cost a
    // student the course they paid for.
    console.error(`[webhook] ${event.event} failed:`, err.message);
    return res.status(500).json({ received: true, handled: false, error: 'processing failed' });
  }
});
