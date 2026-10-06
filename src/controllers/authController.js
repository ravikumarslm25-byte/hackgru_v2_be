import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { signToken } from '../utils/token.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import {
  generateOtp, hashOtp, compareOtp,
  OTP_TTL_MS, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS,
} from '../utils/otp.js';
import { sendOtpEmail, sendWelcomeEmail, sendPasswordResetEmail, isMailEnabled } from '../services/email/index.js';
import { notifyUser, notifyAdmins } from '../services/notify.js';

import { ALL_PERMISSIONS } from '../config/permissions.js';

const publicUser = (u) => ({
  id: u._id, name: u.name, email: u.email, role: u.role,
  phone: u.phone, track: u.track, institution: u.institution,
  avatar: u.avatar, bio: u.bio, emailVerified: u.emailVerified,
  designation: u.designation || '',
  staffRole: u.staffRole ? { id: u.staffRole._id, name: u.staffRole.name, key: u.staffRole.key } : null,
  permissions: u.role === 'admin' ? ALL_PERMISSIONS : (u.staffRole?.permissions || []),
});

/**
 * Generate a fresh OTP, store its hash + expiry on the user, and email it.
 *
 * In development WITHOUT SMTP configured, the code is printed to the server
 * console so the flow is still testable. In production, if mail is disabled the
 * caller has bigger problems — but we never leak the code in prod logs.
 *
 * Returns nothing sensitive to the client.
 */
export async function issueOtp(user) {
  const otp = generateOtp();
  user.emailOtpHash = await hashOtp(otp);
  user.emailOtpExpires = new Date(Date.now() + OTP_TTL_MS);
  user.emailOtpAttempts = 0;
  user.emailOtpLastSentAt = new Date();
  await user.save();

  const result = await sendOtpEmail({ to: user.email, name: user.name, otp });

  if (!result.sent && env.nodeEnv !== 'production') {
    console.log(`\n  ┌─────────────────────────────────────────────┐`);
    console.log(`  │  DEV OTP for ${user.email}`);
    console.log(`  │  CODE: ${otp}   (mail disabled — set SMTP_* to email it)`);
    console.log(`  └─────────────────────────────────────────────┘\n`);
  }
  return result;
}

// @route POST /api/auth/register
// Creates an UNVERIFIED account and emails an OTP. No token is returned — the
// student must verify their email (POST /auth/verify-email) to get one.
export const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone, track } = req.body;
  if (!name || !email || !password) throw ApiError.badRequest('Name, email and password are required');
  if (String(password).length < 6) throw ApiError.badRequest('Password must be at least 6 characters');

  const cleanEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: cleanEmail }).select('+emailOtpLastSentAt');

  if (existing) {
    // If the existing account is already verified, this is a real conflict.
    if (existing.emailVerified) {
      throw ApiError.conflict('An account with this email already exists. Please log in.');
    }
    // Unverified: let them continue — resend a code instead of blocking. This
    // covers the common "I closed the tab before verifying" case.
    await issueOtp(existing);
    return ok(res, { needsVerification: true, email: existing.email },
      'That email is registered but not verified. We\'ve sent a new code.', 200);
  }

  const user = await User.create({ name, email: cleanEmail, password, phone, track, emailVerified: false });
  await issueOtp(user);

  ok(res, { needsVerification: true, email: user.email },
    'Account created. Enter the code we emailed you to verify.', 201);
});

// @route POST /api/auth/verify-email   { email, otp }
// On success: marks the email verified, sends the welcome email, returns a token.
export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) throw ApiError.badRequest('Email and code are required');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .select('+emailOtpHash +emailOtpExpires +emailOtpAttempts');
  if (!user) throw ApiError.badRequest('No pending registration for this email. Please register again.');

  if (user.emailVerified) {
    // Already done — just log them in rather than error.
    const token = signToken({ id: user._id, role: user.role });
    return ok(res, { token, user: publicUser(user) }, 'Email already verified');
  }

  if (!user.emailOtpHash || !user.emailOtpExpires) {
    throw ApiError.badRequest('No active code. Please request a new one.');
  }
  if (user.emailOtpExpires.getTime() < Date.now()) {
    throw ApiError.badRequest('This code has expired. Please request a new one.');
  }
  if (user.emailOtpAttempts >= OTP_MAX_ATTEMPTS) {
    throw ApiError.badRequest('Too many incorrect attempts. Please request a new code.');
  }

  const good = await compareOtp(otp, user.emailOtpHash);
  if (!good) {
    user.emailOtpAttempts += 1;
    await user.save();
    const left = Math.max(0, OTP_MAX_ATTEMPTS - user.emailOtpAttempts);
    throw ApiError.badRequest(`Incorrect code.${left ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ' Please request a new code.'}`);
  }

  // Verified. Clear the OTP material and issue a session.
  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  user.emailOtpHash = null;
  user.emailOtpExpires = null;
  user.emailOtpAttempts = 0;
  await user.save();

  sendWelcomeEmail({ to: user.email, name: user.name }); // fire-and-forget
  notifyUser(user._id, { type: 'registration', title: 'Welcome to HackGRU!', body: 'Your email is verified and your account is ready.', link: '/dashboard' });
  notifyAdmins({ type: 'registration', title: 'New student registered', body: `${user.name} (${user.email}) just verified their account.`, link: '/admin/students' });

  const token = signToken({ id: user._id, role: user.role });
  ok(res, { token, user: publicUser(user) }, 'Email verified. Welcome to HackGRU!');
});

// @route POST /api/auth/resend-otp   { email }
export const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw ApiError.badRequest('Email is required');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .select('+emailOtpLastSentAt');
  // Don't reveal whether an email exists. Always respond the same way.
  if (!user || user.emailVerified) {
    return ok(res, { ok: true }, 'If that email needs verification, a new code is on its way.');
  }

  if (user.emailOtpLastSentAt && Date.now() - user.emailOtpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil((OTP_RESEND_COOLDOWN_MS - (Date.now() - user.emailOtpLastSentAt.getTime())) / 1000);
    throw ApiError.badRequest(`Please wait ${wait}s before requesting another code.`);
  }

  await issueOtp(user);
  ok(res, { ok: true }, 'A new code is on its way.');
});

// @route POST /api/auth/login
// Blocks unverified accounts and re-sends a code so the client can redirect to
// the verification screen.
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) throw ApiError.badRequest('Email and password are required');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .select('+password +emailOtpLastSentAt').populate('staffRole', 'name key permissions');
  if (!user || !(await user.matchPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (user.isActive === false) throw ApiError.unauthorized('This account has been deactivated. Contact your administrator.');

  // Email verification is a STUDENT requirement only. Admin, college (spoc),
  // instructor and corporate accounts are created by an admin, not self-signup,
  // so they're never sent through OTP and must not be blocked here.
  if (!user.emailVerified && user.role === 'student') {
    // Send a fresh code (respecting cooldown) so the verify screen is ready.
    const onCooldown = user.emailOtpLastSentAt &&
      Date.now() - user.emailOtpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS;
    if (!onCooldown) await issueOtp(user);
    throw new ApiError(403, 'Please verify your email to continue. We\'ve sent you a code.', { needsVerification: true, email: user.email });
  }

  user.lastLoginAt = new Date();
  await user.save();
  const token = signToken({ id: user._id, role: user.role });
  ok(res, { token, user: publicUser(user) }, 'Login successful');
});

// @route GET /api/auth/me
export const getMe = asyncHandler(async (req, res) => {
  ok(res, { user: publicUser(req.user) });
});

// @route PUT /api/auth/me
export const updateMe = asyncHandler(async (req, res) => {
  const allowed = ['name', 'phone', 'track', 'institution', 'bio', 'avatar'];
  allowed.forEach((f) => { if (req.body[f] !== undefined) req.user[f] = req.body[f]; });
  await req.user.save();
  ok(res, { user: publicUser(req.user) }, 'Profile updated');
});

// @route POST /api/auth/forgot-password   { email }
// Always responds the same way — never reveals whether an email exists.
export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw ApiError.badRequest('Email is required');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .select('+resetOtpLastSentAt');

  if (user) {
    // Cooldown, quietly (don't leak that the account exists via timing/message).
    const onCooldown = user.resetOtpLastSentAt &&
      Date.now() - user.resetOtpLastSentAt.getTime() < OTP_RESEND_COOLDOWN_MS;
    if (!onCooldown) {
      const otp = generateOtp();
      user.resetOtpHash = await hashOtp(otp);
      user.resetOtpExpires = new Date(Date.now() + OTP_TTL_MS);
      user.resetOtpAttempts = 0;
      user.resetOtpLastSentAt = new Date();
      await user.save();

      const result = await sendPasswordResetEmail({ to: user.email, name: user.name, otp });
      if (!result.sent && env.nodeEnv !== 'production') {
        console.log(`\n  ┌─────────────────────────────────────────────┐`);
        console.log(`  │  DEV RESET OTP for ${user.email}`);
        console.log(`  │  CODE: ${otp}`);
        console.log(`  └─────────────────────────────────────────────┘\n`);
      }
    }
  }

  ok(res, { ok: true }, 'If an account exists for that email, a reset code is on its way.');
});

// @route POST /api/auth/reset-password   { email, otp, password }
export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, password } = req.body;
  if (!email || !otp || !password) throw ApiError.badRequest('Email, code and new password are required');
  if (String(password).length < 6) throw ApiError.badRequest('Password must be at least 6 characters');

  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .select('+resetOtpHash +resetOtpExpires +resetOtpAttempts');
  if (!user || !user.resetOtpHash || !user.resetOtpExpires) {
    throw ApiError.badRequest('No active reset request. Please start again.');
  }
  if (user.resetOtpExpires.getTime() < Date.now()) {
    throw ApiError.badRequest('This code has expired. Please request a new one.');
  }
  if (user.resetOtpAttempts >= OTP_MAX_ATTEMPTS) {
    throw ApiError.badRequest('Too many incorrect attempts. Please request a new code.');
  }

  const good = await compareOtp(otp, user.resetOtpHash);
  if (!good) {
    user.resetOtpAttempts += 1;
    await user.save();
    const left = Math.max(0, OTP_MAX_ATTEMPTS - user.resetOtpAttempts);
    throw ApiError.badRequest(`Incorrect code.${left ? ` ${left} attempt${left === 1 ? '' : 's'} left.` : ' Please request a new code.'}`);
  }

  // Set the new password (the model's pre-save hook hashes it).
  user.password = password;
  user.resetOtpHash = null;
  user.resetOtpExpires = null;
  user.resetOtpAttempts = 0;
  // Resetting the password also verifies the email — they proved they own it.
  if (!user.emailVerified) { user.emailVerified = true; user.emailVerifiedAt = new Date(); }
  await user.save();

  ok(res, { ok: true }, 'Password reset. You can now log in with your new password.');
});
