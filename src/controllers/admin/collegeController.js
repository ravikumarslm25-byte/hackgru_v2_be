import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { College } from '../../models/org/College.js';
import { Department } from '../../models/org/Department.js';
import { Batch } from '../../models/org/Batch.js';
import { User } from '../../models/User.js';

// @route GET /api/admin/colleges
export const listColleges = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.q) filter.$or = [
    { name: new RegExp(req.query.q, 'i') }, { code: new RegExp(req.query.q, 'i') },
  ];
  const colleges = await College.find(filter).sort('name').lean();

  // Counts the admin list actually needs
  const ids = colleges.map((c) => c._id);
  const [depts, batches, students] = await Promise.all([
    Department.aggregate([{ $match: { college: { $in: ids } } }, { $group: { _id: '$college', n: { $sum: 1 } } }]),
    Batch.aggregate([{ $match: { college: { $in: ids } } }, { $group: { _id: '$college', n: { $sum: 1 } } }]),
    User.aggregate([{ $match: { college: { $in: ids }, role: 'student' } }, { $group: { _id: '$college', n: { $sum: 1 } } }]),
  ]);
  const byId = (rows) => Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
  const d = byId(depts), b = byId(batches), s = byId(students);

  ok(res, {
    colleges: colleges.map((c) => ({
      ...c,
      departmentCount: d[String(c._id)] || 0,
      batchCount: b[String(c._id)] || 0,
      studentCount: s[String(c._id)] || 0,
    })),
  });
});

// @route POST /api/admin/colleges
export const createCollege = asyncHandler(async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) throw ApiError.badRequest('Name and code are required.');
  const college = await College.create({ ...req.body, code: code.toUpperCase(), createdBy: req.user._id });
  ok(res, { college }, 'College created', 201);
});

// @route GET /api/admin/colleges/:id
export const getCollege = asyncHandler(async (req, res) => {
  const college = await College.findById(req.params.id).lean();
  if (!college) throw ApiError.notFound('College not found');
  const [departments, batches, spocs, studentCount] = await Promise.all([
    Department.find({ college: college._id }).sort('code').lean(),
    Batch.find({ college: college._id }).populate('course', 'title').populate('department', 'code').sort('-createdAt').lean(),
    User.find({ role: 'spoc', 'spocAccess.college': college._id }).select('name email phone spocAccess isActive').lean(),
    User.countDocuments({ college: college._id, role: 'student' }),
  ]);
  ok(res, { college, departments, batches, spocs, studentCount });
});

// @route PUT /api/admin/colleges/:id
export const updateCollege = asyncHandler(async (req, res) => {
  const college = await College.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!college) throw ApiError.notFound('College not found');
  ok(res, { college }, 'College updated');
});

// @route DELETE /api/admin/colleges/:id — deactivate, never delete
export const deactivateCollege = asyncHandler(async (req, res) => {
  const students = await User.countDocuments({ college: req.params.id, role: 'student' });
  const college = await College.findById(req.params.id);
  if (!college) throw ApiError.notFound('College not found');
  // Deleting would orphan every student, batch and payment attached to it.
  college.isActive = false;
  await college.save();
  ok(res, { college, students }, `College deactivated. ${students} student record(s) are unaffected.`);
});

/* ───────────────── departments ───────────────── */

// @route GET /api/admin/departments?college=
export const listDepartments = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.college) filter.college = req.query.college;
  const departments = await Department.find(filter).populate('college', 'name code').sort('code').lean();
  ok(res, { departments });
});

// @route POST /api/admin/departments
export const createDepartment = asyncHandler(async (req, res) => {
  const { college, name, code } = req.body;
  if (!college || !name || !code) throw ApiError.badRequest('College, name and code are required.');
  if (!(await College.exists({ _id: college }))) throw ApiError.notFound('College not found');
  const department = await Department.create({ ...req.body, code: code.toUpperCase() });
  ok(res, { department }, 'Department created', 201);
});

// @route PUT /api/admin/departments/:id
export const updateDepartment = asyncHandler(async (req, res) => {
  const department = await Department.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!department) throw ApiError.notFound('Department not found');
  ok(res, { department }, 'Department updated');
});
