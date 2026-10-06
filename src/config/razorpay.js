import crypto from 'crypto';
import { env } from './env.js';

/**
 * Razorpay is optional at boot: the site runs fine without keys,
 * checkout simply reports that payments aren't configured yet.
 * Add RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET to .env to enable.
 */
export const isPaymentsEnabled = () => Boolean(env.razorpayKeyId && env.razorpayKeySecret);

let cached = null;
export const getRazorpay = async () => {
  if (!isPaymentsEnabled()) return null;
  if (cached) return cached;
  const { default: Razorpay } = await import('razorpay');
  cached = new Razorpay({ key_id: env.razorpayKeyId, key_secret: env.razorpayKeySecret });
  return cached;
};

/** Verify the checkout signature returned by Razorpay's browser handler. */
export const verifySignature = ({ orderId, paymentId, signature }) => {
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  // timing-safe compare
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Verify a webhook payload signature. */
export const verifyWebhook = (rawBody, signature) => {
  if (!env.razorpayWebhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
