import { env } from '../../config/env.js';

/* HackGRU brand */
const PURPLE = '#61429f';
const GOLD = '#f6b417';
const INK = '#1b1630';
const site = env.publicSiteUrl || 'https://hackgru.com';
const support = env.mail.supportEmail;

/** Shared shell so every email looks like HackGRU. */
function layout({ title, body, preheader = '' }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f2f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2f9;padding:24px 0;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(27,22,48,.08);">
  <tr><td style="height:5px;background:${GOLD};font-size:0;line-height:0;">&nbsp;</td></tr>
  <tr><td align="center" style="background:#ffffff;padding:28px 32px 24px;border-bottom:1px solid #f0edf7;">
    <img src="${site}/brand/hackgru-logo.png" alt="HackGRU" width="164" height="55" style="display:block;width:164px;max-width:62%;height:auto;border:0;outline:none;text-decoration:none;" />
  </td></tr>
  <tr><td style="padding:32px;color:${INK};font-size:15px;line-height:1.6;">
    ${body}
  </td></tr>
  <tr><td style="padding:20px 32px;background:#faf9fd;color:#8a86a0;font-size:12px;line-height:1.5;border-top:1px solid #eee;">
    Need help? Write to <a href="mailto:${support}" style="color:${PURPLE};">${support}</a>.<br>
    © ${new Date().getFullYear()} HackGRU · <a href="${site}" style="color:${PURPLE};">${site.replace(/^https?:\/\//, '')}</a>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

const btn = (href, label) =>
  `<a href="${href}" style="display:inline-block;background:${GOLD};color:${INK};font-weight:700;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;">${label}</a>`;

/** OTP verification. */
export function otpEmail({ name, otp, ttlMinutes }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Verify your email</h1>
    <p style="margin:0 0 20px;color:#555;">Hi ${name || 'there'}, use this code to confirm your email and finish creating your HackGRU account.</p>
    <div style="text-align:center;margin:8px 0 24px;">
      <div style="display:inline-block;background:#f2eefb;border:1px dashed ${PURPLE};border-radius:10px;padding:14px 28px;font-size:32px;font-weight:800;letter-spacing:10px;color:${PURPLE};">${otp}</div>
    </div>
    <p style="margin:0 0 6px;color:#555;">This code expires in <strong>${ttlMinutes} minutes</strong>.</p>
    <p style="margin:0;color:#999;font-size:13px;">Didn't request this? You can safely ignore this email — no account is created until the code is entered.</p>`;
  return { subject: `${otp} is your HackGRU verification code`, html: layout({ title: 'Verify your email', preheader: `Your code is ${otp}`, body }) };
}

/** Welcome — sent AFTER the email is verified. */
export function welcomeEmail({ name }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Welcome to HackGRU, ${name || 'there'} 🎉</h1>
    <p style="margin:0 0 16px;color:#555;">Your email is verified and your account is ready. You're all set to start building industry-ready skills.</p>
    <p style="margin:0 0 24px;color:#555;">Log in to explore courses, take the SSAT skill assessment, and build your resume.</p>
    <div style="text-align:center;margin:0 0 8px;">${btn(`${site}/login`, 'Go to your dashboard')}</div>`;
  return { subject: 'Welcome to HackGRU — your account is ready', html: layout({ title: 'Welcome to HackGRU', preheader: 'Your account is verified and ready.', body }) };
}

/** Password reset OTP. */
export function resetPasswordEmail({ name, otp, ttlMinutes }) {
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Reset your password</h1>
    <p style="margin:0 0 20px;color:#555;">Hi ${name || 'there'}, use this code to set a new password for your HackGRU account.</p>
    <div style="text-align:center;margin:8px 0 24px;">
      <div style="display:inline-block;background:#f2eefb;border:1px dashed ${PURPLE};border-radius:10px;padding:14px 28px;font-size:32px;font-weight:800;letter-spacing:10px;color:${PURPLE};">${otp}</div>
    </div>
    <p style="margin:0 0 6px;color:#555;">This code expires in <strong>${ttlMinutes} minutes</strong>.</p>
    <p style="margin:0;color:#999;font-size:13px;">Didn't ask to reset your password? Ignore this email — your password stays the same.</p>`;
  return { subject: `${otp} is your HackGRU password reset code`, html: layout({ title: 'Reset your password', preheader: `Your reset code is ${otp}`, body }) };
}

/** Payment confirmation / receipt. */
export function paymentEmail({ name, courseTitle, amount, currency = 'INR', paymentId, method }) {
  const amt = `${currency === 'INR' ? '₹' : currency + ' '}${Number(amount).toLocaleString('en-IN')}`;
  const row = (k, v) => `<tr><td style="padding:6px 0;color:#888;">${k}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:${INK};">${v}</td></tr>`;
  const body = `
    <h1 style="margin:0 0 8px;font-size:22px;">Payment confirmed ✅</h1>
    <p style="margin:0 0 20px;color:#555;">Thank you, ${name || 'there'}. Your enrolment is confirmed and your seat is secured.</p>
    <table role="presentation" width="100%" style="border:1px solid #eee;border-radius:10px;padding:12px 16px;font-size:14px;">
      ${courseTitle ? row('Course', courseTitle) : ''}
      ${row('Amount paid', amt)}
      ${method ? row('Method', method) : ''}
      ${paymentId ? row('Payment ID', paymentId) : ''}
      ${row('Date', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}
    </table>
    <div style="text-align:center;margin:24px 0 8px;">${btn(`${site}/dashboard`, 'Open your dashboard')}</div>
    <p style="margin:16px 0 0;color:#999;font-size:13px;">Keep this email as your receipt.</p>`;
  return { subject: `Payment confirmed${courseTitle ? ` — ${courseTitle}` : ''} · HackGRU`, html: layout({ title: 'Payment confirmed', preheader: `Receipt for ${amt}`, body }) };
}
