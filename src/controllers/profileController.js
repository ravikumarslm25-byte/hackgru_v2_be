import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { User } from '../models/User.js';
import { Upload } from '../models/Upload.js';
import { signedDownload, replace as replaceUpload } from '../services/storage/index.js';

/** Everything a profile page needs, for any role. */
const shape = async (u) => {
  let photoUrl = null;
  if (u.photoUpload) {
    const up = await Upload.findById(u.photoUpload);
    // A 5-minute link. The bucket is private; this is the only way to see it.
    if (up?.status === 'ready') photoUrl = await signedDownload(up, { inline: true }).catch(() => null);
  }
  return {
    id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role,
    bio: u.bio, avatar: u.avatar, photoUrl, photoUpload: u.photoUpload,
    dateOfBirth: u.dateOfBirth, gender: u.gender,
    address: u.address, links: u.links,
    registerNumber: u.registerNumber, year: u.year, institution: u.institution,
    track: u.track,
    college: u.college || u.spocAccess?.college || null,
    department: u.department,
    designation: u.spocAccess?.designation || '',
    createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
  };
};

// @route GET /api/profile
export const getProfile = asyncHandler(async (req, res) => {
  const u = await User.findById(req.user._id)
    .populate('college', 'name code').populate('department', 'name code')
    .populate('spocAccess.college', 'name code');
  ok(res, { profile: await shape(u), completeness: u.profileCompleteness() });
});

// @route PUT /api/profile
export const updateProfile = asyncHandler(async (req, res) => {
  const u = await User.findById(req.user._id);

  // An allowlist, not a spread. `role`, `college` and `spocAccess` decide what
  // someone can SEE — letting a profile form write them would be a privilege
  // escalation via the settings page.
  const ALLOWED = ['name', 'phone', 'bio', 'dateOfBirth', 'gender'];
  for (const f of ALLOWED) if (req.body[f] !== undefined) u[f] = req.body[f];

  if (req.body.address) {
    for (const k of ['line1', 'city', 'state', 'pincode']) {
      if (req.body.address[k] !== undefined) u.address[k] = req.body.address[k];
    }
  }
  if (req.body.links) {
    for (const k of ['github', 'linkedin', 'portfolio']) {
      if (req.body.links[k] !== undefined) u.links[k] = req.body.links[k];
    }
  }

  // A student may fix their own register number and year; a college can't be
  // self-assigned — that's what makes them visible to a portal.
  if (u.role === 'student') {
    if (req.body.registerNumber !== undefined) u.registerNumber = String(req.body.registerNumber).trim().toUpperCase();
    if (req.body.year !== undefined) u.year = req.body.year;
    if (req.body.institution !== undefined && !u.college) u.institution = req.body.institution;
  }
  if (u.role === 'spoc' && req.body.designation !== undefined) {
    u.spocAccess.designation = req.body.designation;
    u.markModified('spocAccess');
  }

  await u.save();
  ok(res, { profile: await shape(u), completeness: u.profileCompleteness() }, 'Profile updated');
});

// @route PUT /api/profile/photo   { uploadId }
export const setPhoto = asyncHandler(async (req, res) => {
  const { uploadId } = req.body;
  const u = await User.findById(req.user._id);

  if (!uploadId) {
    // Removing it — delete the object too, or you pay for orphaned bytes forever.
    await replaceUpload({ oldUploadId: u.photoUpload, newUploadId: null });
    u.photoUpload = null;
    await u.save();
    return ok(res, { profile: await shape(u), completeness: u.profileCompleteness() }, 'Photo removed');
  }

  const up = await Upload.findById(uploadId);
  if (!up) throw ApiError.notFound('Upload not found.');
  if (String(up.owner) !== String(u._id)) throw ApiError.forbidden('That is not your upload.');
  if (up.purpose !== 'student-photo') throw ApiError.badRequest('That file is not a photo.');
  if (up.status !== 'ready') throw ApiError.badRequest("That upload didn't finish.");

  const old = u.photoUpload;
  u.photoUpload = up._id;
  await u.save();
  await replaceUpload({ oldUploadId: old, newUploadId: up._id });   // bin the previous one

  ok(res, { profile: await shape(u), completeness: u.profileCompleteness() }, 'Photo updated');
});

// @route PUT /api/profile/password   { currentPassword, newPassword }
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw ApiError.badRequest('Both passwords are required.');
  if (String(newPassword).length < 6) throw ApiError.badRequest('The new password must be at least 6 characters.');

  const u = await User.findById(req.user._id).select('+password');

  // Always verify the current one. Without it, anyone who borrows an unlocked
  // laptop owns the account — and a stolen token becomes permanent.
  if (!(await u.matchPassword(currentPassword))) {
    throw ApiError.unauthorized('That current password is wrong.');
  }
  if (await u.matchPassword(newPassword)) {
    throw ApiError.badRequest('That is your current password — pick a different one.');
  }

  u.password = newPassword;   // hashed by the pre-save hook
  await u.save();
  ok(res, {}, 'Password changed. Your other devices stay signed in until their session expires.');
});
