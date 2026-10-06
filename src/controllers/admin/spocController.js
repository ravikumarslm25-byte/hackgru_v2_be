import crypto from 'crypto';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { User } from '../../models/User.js';
import { College } from '../../models/org/College.js';
import { Batch } from '../../models/org/Batch.js';
import { SPOC_PERMISSIONS, DEFAULT_SPOC_PERMISSIONS, isValidPermission } from '../../services/access/permissions.js';
import { assertDepartmentsBelongTo } from '../../services/access/validateSpoc.js';

const shape = (u) => ({
  id: u._id, name: u.name, email: u.email, phone: u.phone,
  isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  access: u.spocAccess,
});

// @route GET /api/admin/spocs/permissions — the vocabulary, for the UI
export const permissionCatalogue = asyncHandler(async (_req, res) => {
  ok(res, { permissions: SPOC_PERMISSIONS, defaults: DEFAULT_SPOC_PERMISSIONS });
});

// @route GET /api/admin/spocs?college=
export const listSpocs = asyncHandler(async (req, res) => {
  const filter = { role: 'spoc' };
  if (req.query.college) filter['spocAccess.college'] = req.query.college;
  const spocs = await User.find(filter)
    .populate('spocAccess.college', 'name code')
    .populate('spocAccess.departments', 'name code')
    .sort('-createdAt').lean();
  ok(res, { spocs: spocs.map((s) => ({ ...shape(s), access: s.spocAccess })) });
});

// @route POST /api/admin/spocs
export const createSpoc = asyncHandler(async (req, res) => {
  const { name, email, phone, college, departments = [], can, designation, password } = req.body;
  if (!name || !email || !college) throw ApiError.badRequest('Name, email and college are required.');

  if (!(await College.exists({ _id: college }))) throw ApiError.notFound('College not found');
  if (await User.exists({ email: String(email).toLowerCase() })) {
    throw ApiError.conflict('An account with this email already exists.');
  }

  await assertDepartmentsBelongTo(college, departments);

  const perms = (can || DEFAULT_SPOC_PERMISSIONS).filter(isValidPermission);

  // Generated, not chosen — an admin typing a password for someone else means
  // the admin knows it. They set their own on first login.
  const tempPassword = password || crypto.randomBytes(6).toString('base64url');

  const spoc = await User.create({
    name, email: String(email).toLowerCase().trim(), phone,
    password: tempPassword,
    role: 'spoc',
    spocAccess: { college, departments, batches: [], can: perms, designation },
  });

  ok(res, {
    spoc: shape(spoc),
    // Shown once. Not stored anywhere in readable form.
    tempPassword,
  }, 'College staff login created', 201);
});

// @route PATCH /api/admin/spocs/:id
export const updateSpoc = asyncHandler(async (req, res) => {
  const spoc = await User.findOne({ _id: req.params.id, role: 'spoc' });
  if (!spoc) throw ApiError.notFound('College staff account not found');

  const { name, phone, departments, batches, can, designation, isActive } = req.body;
  if (name !== undefined) spoc.name = name;
  if (phone !== undefined) spoc.phone = phone;
  if (isActive !== undefined) spoc.isActive = isActive;

  if (departments !== undefined) {
    await assertDepartmentsBelongTo(spoc.spocAccess.college, departments);
    spoc.spocAccess.departments = departments;
  }
  if (batches !== undefined) spoc.spocAccess.batches = batches;
  if (can !== undefined) spoc.spocAccess.can = can.filter(isValidPermission);
  if (designation !== undefined) spoc.spocAccess.designation = designation;

  spoc.markModified('spocAccess');
  await spoc.save();
  ok(res, { spoc: shape(spoc) }, 'Access updated');
});

// @route POST /api/admin/spocs/:id/reset-password
export const resetSpocPassword = asyncHandler(async (req, res) => {
  const spoc = await User.findOne({ _id: req.params.id, role: 'spoc' });
  if (!spoc) throw ApiError.notFound('College staff account not found');
  const tempPassword = crypto.randomBytes(6).toString('base64url');
  spoc.password = tempPassword;
  await spoc.save();
  ok(res, { tempPassword }, 'Password reset. Share this once — it is not stored.');
});


// @route DELETE /api/admin/spocs/:id
export const deleteSpoc = asyncHandler(async (req, res) => {
  const spoc = await User.findOne({ _id: req.params.id, role: 'spoc' });
  if (!spoc) throw ApiError.notFound('College staff account not found');

  // A SPOC owns no records — deleting one removes a login, nothing else. Unlike
  // a student, there is no payment history to orphan, so a real delete is safe.
  const name = spoc.name;
  await spoc.deleteOne();
  ok(res, {}, `${name}'s login removed. Their college's data is untouched.`);
});

// @route GET /api/admin/spocs/assignable?college=&departments=
// The batches a SPOC can be scoped to. Only live ones — granting access to a
// finished cohort is noise, and to a cancelled one is meaningless.
export const assignableBatches = asyncHandler(async (req, res) => {
  const { college, departments } = req.query;
  if (!college) throw ApiError.badRequest('A college is required.');

  const filter = { college, status: { $in: ['open', 'running'] } };
  if (departments) {
    const ids = String(departments).split(',').filter(Boolean);
    if (ids.length) filter.$or = [{ department: { $in: ids } }, { departments: { $in: ids } }];
  }

  const batches = await Batch.find(filter)
    .populate('department', 'name code').populate('course', 'title')
    .select('name code status department course stats seats')
    .sort('-createdAt').lean();
  ok(res, { batches });
});
