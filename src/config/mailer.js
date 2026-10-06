import nodemailer from 'nodemailer';
import { env } from './env.js';

/**
 * One shared SMTP transport. Built lazily, once.
 *
 * If SMTP credentials are absent, mail is DISABLED rather than broken: send()
 * becomes a no-op that returns { sent: false }. Callers decide what that means
 * (in dev we log the OTP to the console; in production register() refuses).
 */
let transport = null;

export function isMailEnabled() {
  return Boolean(env.mail.user && env.mail.pass);
}

function getTransport() {
  if (!isMailEnabled()) return null;
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      auth: { user: env.mail.user, pass: env.mail.pass },
    });
  }
  return transport;
}

/**
 * Send an email. Never throws — a failed email must not 500 a request that has
 * already changed state (e.g. an order that's already paid). Returns a result
 * the caller can inspect and log.
 */
export async function sendMail({ to, subject, html, text }) {
  const t = getTransport();
  if (!t) {
    console.warn(`[mail] disabled (no SMTP creds) — would have sent "${subject}" to ${to}`);
    return { sent: false, reason: 'mail-disabled' };
  }
  try {
    const info = await t.sendMail({
      from: env.mail.from,
      to,
      subject,
      text: text || html?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      html,
    });
    console.log(`[mail] sent "${subject}" to ${to} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[mail] FAILED to send "${subject}" to ${to}: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

/** Verify SMTP works at boot — logs a clear line, never throws. */
export async function checkMail() {
  if (!isMailEnabled()) {
    console.warn('  Email is DISABLED (SMTP_USER / SMTP_PASS not set). OTPs will print to this console in development.');
    return;
  }
  try {
    await getTransport().verify();
    console.log(`✓ Email ready: ${env.mail.user} via ${env.mail.host}`);
  } catch (err) {
    console.error(`✗ Email misconfigured (${err.message}). Check SMTP_* in .env — Gmail needs an App Password, not the login password.`);
  }
}
