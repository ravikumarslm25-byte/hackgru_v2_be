import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { ProjectSubmission } from '../models/ProjectSubmission.js';
import { Course } from '../models/Course.js';
import { Enrollment } from '../models/Enrollment.js';
import { Upload } from '../models/Upload.js';
import { signedDownload } from '../services/storage/index.js';
import { can } from '../services/access/entitlements.js';

async function access(studentId, courseId) {
  const enr = await Enrollment.findOne({ student: studentId, course: courseId }).select('paid batch').lean();
  const hasAccess = (enr && enr.paid) || (await can(studentId, 'live_cohort', courseId));
  return { hasAccess, batch: enr?.batch || null };
}

const shape = (p) => ({
  id: p._id, course: p.course, title: p.title, note: p.note, link: p.link,
  status: p.status, score: p.score, feedback: p.feedback, submittedAt: p.submittedAt,
  files: (p.files || []).map((u) => ({ id: u._id || u, name: u.originalName, size: u.size, contentType: u.contentType })),
});

// GET /api/projects/course/:courseId  — this student's submission + whether upload is allowed
export const getMine = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId).select('allowProjectUpload title').lean();
  if (!course) throw ApiError.notFound('Course not found.');
  const { hasAccess } = await access(req.user._id, req.params.courseId);
  if (!hasAccess) throw ApiError.forbidden("You don't have access to this course.");

  const sub = await ProjectSubmission.findOne({ student: req.user._id, course: req.params.courseId })
    .populate('files', 'originalName size contentType').lean();
  ok(res, { allowed: Boolean(course.allowProjectUpload), submission: sub ? shape(sub) : null });
});

// PUT /api/projects/course/:courseId  — create or update this student's submission
export const submit = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.courseId).select('allowProjectUpload').lean();
  if (!course) throw ApiError.notFound('Course not found.');
  if (!course.allowProjectUpload) throw ApiError.forbidden('Project submission is not open for this course.');

  const { hasAccess, batch } = await access(req.user._id, req.params.courseId);
  if (!hasAccess) throw ApiError.forbidden("You don't have access to this course.");

  const { title = '', note = '', link = '', files = [] } = req.body;
  if (!link && (!files || files.length === 0)) throw ApiError.badRequest('Attach at least one file or add a link.');

  // Only accept uploads this student owns with the student-project purpose.
  let fileIds = [];
  if (Array.isArray(files) && files.length) {
    const owned = await Upload.find({ _id: { $in: files }, owner: req.user._id, purpose: 'student-project' }).select('_id').lean();
    fileIds = owned.map((u) => u._id);
  }

  const sub = await ProjectSubmission.findOneAndUpdate(
    { student: req.user._id, course: req.params.courseId },
    { $set: { title, note, link, files: fileIds, batch, submittedAt: new Date(), status: 'submitted' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).populate('files', 'originalName size contentType');

  ok(res, { submission: shape(sub) }, 'Project submitted');
});

// GET /api/projects/file/:uploadId  — signed URL for one of the student's own project files
export const fileUrl = asyncHandler(async (req, res) => {
  const up = await Upload.findOne({ _id: req.params.uploadId, owner: req.user._id, purpose: 'student-project' });
  if (!up) throw ApiError.notFound('File not found.');
  const url = await signedDownload(up, { inline: true, expiresIn: 300 });
  ok(res, { url, name: up.originalName });
});

/* ─────────────────────────── ADMIN ─────────────────────────── */

// GET /api/admin/projects?course=&batch=  — submissions with student info
export const adminList = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.course) q.course = req.query.course;
  if (req.query.batch) q.batch = req.query.batch;
  const subs = await ProjectSubmission.find(q)
    .populate('student', 'name email registerNumber')
    .populate('files', 'originalName size contentType')
    .sort('-submittedAt').lean();
  ok(res, { projects: subs.map((p) => ({ ...shape(p), student: p.student })) });
});

// GET /api/admin/projects/file/:uploadId  — signed URL (admin, no owner check)
export const adminFileUrl = asyncHandler(async (req, res) => {
  const up = await Upload.findOne({ _id: req.params.uploadId, purpose: 'student-project' });
  if (!up) throw ApiError.notFound('File not found.');
  const url = await signedDownload(up, { inline: true, expiresIn: 300 });
  ok(res, { url, name: up.originalName });
});

// PATCH /api/admin/projects/:id/review  { status, score, feedback }
export const adminReview = asyncHandler(async (req, res) => {
  const { status, score, feedback } = req.body;
  const patch = {};
  if (status) patch.status = status;              // 'reviewed' | 'submitted'
  if (score !== undefined) patch.score = score;
  if (feedback !== undefined) patch.feedback = feedback;
  const sub = await ProjectSubmission.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
    .populate('student', 'name email').populate('files', 'originalName size contentType');
  if (!sub) throw ApiError.notFound('Submission not found.');
  ok(res, { project: { ...shape(sub), student: sub.student } }, 'Project updated');
});
