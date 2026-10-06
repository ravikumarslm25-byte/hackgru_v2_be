import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Material } from '../models/Material.js';
import { Upload } from '../models/Upload.js';
import { Enrollment } from '../models/Enrollment.js';
import { signedDownload } from '../services/storage/index.js';
import { can } from '../services/access/entitlements.js';

const shape = (m) => ({
  id: m._id, course: m.course, batch: m.batch,
  type: m.type, title: m.title, description: m.description,
  url: m.url, body: m.body,
  file: m.upload ? { id: m.upload._id || m.upload, name: m.upload.originalName, size: m.upload.size, contentType: m.upload.contentType } : null,
  visibility: m.visibility, order: m.order, createdAt: m.createdAt,
});

/* ─────────────────────────── ADMIN ─────────────────────────── */

// GET /api/admin/materials?course=&batch=
export const adminList = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.course) q.course = req.query.course;
  if (req.query.batch) q.batch = req.query.batch === 'none' ? null : req.query.batch;
  const items = await Material.find(q).populate('upload', 'originalName size contentType')
    .sort('order createdAt').lean();
  ok(res, { materials: items.map(shape) });
});

// POST /api/admin/materials
export const adminCreate = asyncHandler(async (req, res) => {
  const { course, batch, type, title, description, upload, url, body, visibility, order } = req.body;
  if (!course || !type || !title) throw ApiError.badRequest('course, type and title are required.');
  if (type === 'file' && !upload) throw ApiError.badRequest('A file upload is required for file materials.');
  if (type === 'link' && !url) throw ApiError.badRequest('A URL is required for link materials.');
  if (type === 'text' && !body) throw ApiError.badRequest('Content is required for text materials.');

  const m = await Material.create({
    course, batch: batch || null, type, title,
    description: description || '',
    upload: type === 'file' ? upload : null,
    url: type === 'link' ? url : '',
    body: type === 'text' ? body : '',
    visibility: visibility || 'enrolled',
    order: order || 0,
    createdBy: req.user._id,
  });
  ok(res, { material: shape(m) }, 'Material added', 201);
});

// PATCH /api/admin/materials/:id
export const adminUpdate = asyncHandler(async (req, res) => {
  const allowed = ['title', 'description', 'url', 'body', 'batch', 'visibility', 'order'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];
  if ('batch' in patch && !patch.batch) patch.batch = null;
  const m = await Material.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
    .populate('upload', 'originalName size contentType');
  if (!m) throw ApiError.notFound('Material not found.');
  ok(res, { material: shape(m) }, 'Material updated');
});

// DELETE /api/admin/materials/:id
export const adminDelete = asyncHandler(async (req, res) => {
  const m = await Material.findByIdAndDelete(req.params.id);
  if (!m) throw ApiError.notFound('Material not found.');
  ok(res, { deleted: true }, 'Material removed');
});

/* ─────────────────────────── STUDENT ─────────────────────────── */

/**
 * The student's access + batch for a course, in one lookup. Access is granted
 * by a paid enrolment or a live_cohort entitlement (v2 spine, with the v1
 * fallback baked into can()).
 */
async function courseAccess(studentId, courseId) {
  const enr = await Enrollment.findOne({ student: studentId, course: courseId }).select('paid batch').lean();
  const hasAccess = (enr && enr.paid) || (await can(studentId, 'live_cohort', courseId));
  return { hasAccess, batch: enr?.batch || null };
}

// GET /api/materials/course/:courseId  — resolved for this student
export const studentList = asyncHandler(async (req, res) => {
  const { hasAccess, batch } = await courseAccess(req.user._id, req.params.courseId);
  if (!hasAccess) throw ApiError.forbidden("You don't have access to this course's materials.");

  // The attach rule: course-wide (batch:null) + this student's batch.
  const items = await Material.find({
    course: req.params.courseId,
    $or: [{ batch: null }, ...(batch ? [{ batch }] : [])],
  }).populate('upload', 'originalName size contentType').sort('order createdAt').lean();

  ok(res, { materials: items.map(shape) });
});

// GET /api/materials/:id/download  — signed URL, gated by course access
export const studentDownload = asyncHandler(async (req, res) => {
  const m = await Material.findById(req.params.id).populate('upload');
  if (!m || m.type !== 'file' || !m.upload) throw ApiError.notFound('File not found.');

  const { hasAccess, batch } = await courseAccess(req.user._id, m.course);
  const visibleToBatch = !m.batch || String(m.batch) === String(batch);
  if (!hasAccess || !visibleToBatch) throw ApiError.notFound('File not found.');

  const url = await signedDownload(m.upload, { inline: false, expiresIn: 300 });
  ok(res, { url, name: m.upload.originalName });
});

// GET /api/admin/materials/:id/view  — signed URL for admin (no access gate)
export const adminView = asyncHandler(async (req, res) => {
  const m = await Material.findById(req.params.id).populate('upload');
  if (!m || m.type !== 'file' || !m.upload) throw ApiError.notFound('File not found.');
  const url = await signedDownload(m.upload, { inline: true, expiresIn: 300 });
  ok(res, { url, name: m.upload.originalName });
});
