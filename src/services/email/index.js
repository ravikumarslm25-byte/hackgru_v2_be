import { sendMail, isMailEnabled } from '../../config/mailer.js';
import { otpEmail, welcomeEmail, paymentEmail, resetPasswordEmail } from './templates.js';
import { OTP_TTL_MS } from '../../utils/otp.js';

export { isMailEnabled };

export function sendOtpEmail({ to, name, otp }) {
  const { subject, html } = otpEmail({ name, otp, ttlMinutes: Math.round(OTP_TTL_MS / 60000) });
  return sendMail({ to, subject, html });
}

export function sendPasswordResetEmail({ to, name, otp }) {
  const { subject, html } = resetPasswordEmail({ name, otp, ttlMinutes: Math.round(OTP_TTL_MS / 60000) });
  return sendMail({ to, subject, html });
}

export function sendWelcomeEmail({ to, name }) {
  const { subject, html } = welcomeEmail({ name });
  return sendMail({ to, subject, html });
}

export function sendPaymentConfirmation({ to, name, courseTitle, amount, currency, paymentId, method }) {
  const { subject, html } = paymentEmail({ name, courseTitle, amount, currency, paymentId, method });
  return sendMail({ to, subject, html });
}
