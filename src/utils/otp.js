import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/** OTP policy — one place so every flow agrees. */
export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;   // 10 minutes
export const OTP_MAX_ATTEMPTS = 5;          // wrong tries before the code dies
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;  // 60s between sends

/** A 6-digit numeric code, zero-padded. crypto.randomInt is unbiased. */
export function generateOtp() {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

/** Never store the raw OTP — hash it like a password. */
export function hashOtp(otp) {
  return bcrypt.hash(otp, 10);
}

export function compareOtp(otp, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(String(otp).trim(), hash);
}
