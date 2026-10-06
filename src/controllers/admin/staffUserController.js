import crypto from 'crypto';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { User } from '../../models/User.js';
import { Role } from '../../models/Role.js';

const tempPassword = () => crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || ('Hg' + Date.now().toString(36));

const view = (u) => ({
  id: u._id, name: u.name, email: u.email, phone: u.phone || '', role: u.role,
  designation: u.designation || '', isActive: u.isActive !== false,
  staffRole: u.staffRole ? { id: u.staffRole._id, name: u.staffRole.name, key: u.staffRole.key } : null,
  lastLoginAt: u.lastLoginAt || null, createdAt: u.createdAt,
});

// GET /api/admin/users   — staff + admins (not students)
export const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: ['admin', 'staff'] } })
    .populate('staffRole', 'name key').sort('-createdAt').lean();
  ok(res, { users: users.map(view) });
});

// POST /api/admin/users   { name, email, phone?, designation?, roleId, password? }
export const createUser = asyncHandler(async (req, res) => {
  const { name, email, phone = '', designation = '', roleId } = req.body;
  if (!name || !email) throw ApiError.badRequest('Name and email are required.');
  if (!roleId) throw ApiError.badRequest('Please choose a role.');
  const role = await Role.findById(roleId);
  if (!role) throw ApiError.notFound('Role not found.');
  const cleanEmail = String(email).toLowerCase().trim();
  if (await User.exists({ email: cleanEmail })) throw ApiError.conflict('An account with this email already exists.');

  const password = req.body.password && String(req.body.password).length >= 6 ? req.body.password : tempPassword();
  const user = await User.create({
    name, email: cleanEmail, phone, designation, password,
    role: 'staff', staffRole: role._id,
    emailVerified: true, emailVerifiedAt: new Date(), registrationSource: 'admin',
  });
  ok(res, { user: view({ ...user.toObject(), staffRole: role }), password }, 'User created', 201);
});

// PUT /api/admin/users/:id   { name?, phone?, designation?, roleId?, isActive? }
export const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');
  if (user.role === 'admin' && req.body.roleId) throw ApiError.badRequest('The owner admin account keeps full access.');
  if (req.body.name !== undefined) user.name = req.body.name;
  if (req.body.phone !== undefined) user.phone = req.body.phone;
  if (req.body.designation !== undefined) user.designation = req.body.designation;
  if (req.body.roleId && user.role === 'staff') {
    const role = await Role.findById(req.body.roleId);
    if (!role) throw ApiError.notFound('Role not found.');
    user.staffRole = role._id;
  }
  if (req.body.isActive !== undefined) {
    if (user.role === 'admin' && !req.body.isActive) throw ApiError.badRequest('You cannot deactivate an admin.');
    if (String(user._id) === String(req.user._id) && !req.body.isActive) throw ApiError.badRequest('You cannot deactivate your own account.');
    user.isActive = Boolean(req.body.isActive);
  }
  await user.save();
  const full = await User.findById(user._id).populate('staffRole', 'name key');
  ok(res, { user: view(full) }, 'User updated');
});

// POST /api/admin/users/:id/reset-password   → returns a new temp password
export const resetUserPassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');
  if (user.role === 'admin' && String(user._id) !== String(req.user._id)) {
    throw ApiError.badRequest('An admin resets their own password from their profile.');
  }
  const password = tempPassword();
  user.password = password;   // hashed by pre-save
  await user.save();
  ok(res, { password }, 'Password reset');
});

// DELETE /api/admin/users/:id
export const removeUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');
  if (user.role === 'admin') throw ApiError.badRequest('Admin accounts cannot be deleted here.');
  if (String(user._id) === String(req.user._id)) throw ApiError.badRequest('You cannot delete your own account.');
  await user.deleteOne();
  ok(res, { deleted: true }, 'User removed');
});
