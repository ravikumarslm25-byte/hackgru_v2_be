import crypto from 'crypto';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Role } from '../../models/Role.js';
import { User } from '../../models/User.js';
import { PERMISSION_GROUPS, isValidPermission } from '../../config/permissions.js';

const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const clean = (perms) => [...new Set((Array.isArray(perms) ? perms : []).filter(isValidPermission))];

const DEFAULT_ROLES = [
  { name: 'Teacher', description: 'Delivers courses and content', permissions: ['courses.manage', 'reports.view', 'tickets.manage'] },
  { name: 'Trainer', description: 'Runs training batches', permissions: ['courses.manage', 'batches.manage', 'reports.view'] },
  { name: 'Operations', description: 'Runs day-to-day operations', permissions: ['students.manage', 'batches.manage', 'colleges.manage', 'reports.view'] },
  { name: 'Sales', description: 'Handles colleges and billing', permissions: ['colleges.manage', 'billing.manage', 'reports.view'] },
  { name: 'Support', description: 'Handles student support tickets', permissions: ['tickets.manage', 'students.manage'] },
];

async function seedDefaultsIfEmpty(userId) {
  if (await Role.exists({})) return;
  await Role.insertMany(DEFAULT_ROLES.map((r) => ({ ...r, key: slug(r.name), createdBy: userId })));
}

// GET /api/admin/roles
export const listRoles = asyncHandler(async (req, res) => {
  await seedDefaultsIfEmpty(req.user._id);
  const roles = await Role.find().sort('name').lean();
  const counts = await User.aggregate([
    { $match: { role: 'staff', staffRole: { $ne: null } } },
    { $group: { _id: '$staffRole', n: { $sum: 1 } } },
  ]);
  const cmap = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
  ok(res, {
    roles: roles.map((r) => ({ ...r, userCount: cmap[String(r._id)] || 0 })),
    catalog: PERMISSION_GROUPS,
  });
});

// POST /api/admin/roles   { name, description, permissions }
export const createRole = asyncHandler(async (req, res) => {
  const { name, description = '', permissions } = req.body;
  if (!name) throw ApiError.badRequest('Role name is required.');
  const key = slug(name);
  if (!key) throw ApiError.badRequest('Please use a valid name.');
  if (await Role.exists({ key })) throw ApiError.conflict('A role with a similar name already exists.');
  const role = await Role.create({ name, key, description, permissions: clean(permissions), createdBy: req.user._id });
  ok(res, { role }, 'Role created', 201);
});

// PUT /api/admin/roles/:id   { name?, description?, permissions? }
export const updateRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound('Role not found.');
  if (req.body.name && !role.isSystem) { role.name = req.body.name; role.key = slug(req.body.name); }
  if (req.body.description !== undefined) role.description = req.body.description;
  if (req.body.permissions !== undefined) role.permissions = clean(req.body.permissions);
  await role.save();
  ok(res, { role }, 'Role updated');
});

// DELETE /api/admin/roles/:id
export const removeRole = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound('Role not found.');
  if (role.isSystem) throw ApiError.badRequest('System roles cannot be deleted.');
  const inUse = await User.countDocuments({ staffRole: role._id });
  if (inUse > 0) throw ApiError.badRequest(`This role is assigned to ${inUse} user(s). Reassign them first.`);
  await role.deleteOne();
  ok(res, { deleted: true }, 'Role deleted');
});
