import crypto from 'crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { CertificateTemplate } from '../models/CertificateTemplate.js';
import { Certificate } from '../models/Certificate.js';
import { Course } from '../models/Course.js';
import { User } from '../models/User.js';
import { Enrollment } from '../models/Enrollment.js';
import { Upload } from '../models/Upload.js';
import { signedDownload } from '../services/storage/index.js';

/* ── helpers ── */
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

function fillPlaceholders(text, vars) {
  return String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));
}

async function nextSerial() {
  const year = new Date().getFullYear();
  // Sequence = issued-this-year + 1, with a retry guard on the unique index.
  const count = await Certificate.countDocuments({ serialNo: new RegExp(`^HG-${year}-`) });
  return `HG-${year}-${String(count + 1).padStart(5, '0')}`;
}

async function assetUrl(uploadId) {
  if (!uploadId) return '';
  const up = await Upload.findById(uploadId);
  if (!up) return '';
  try { return await signedDownload(up, { inline: true, expiresIn: 600 }); } catch { return ''; }
}

const tShape = (t) => ({
  id: t._id, name: t.name, type: t.type, orientation: t.orientation,
  companyName: t.companyName, logo: t.logo, additionalLogo: t.additionalLogo,
  accentColor: t.accentColor, secondaryColor: t.secondaryColor, titleColor: t.titleColor, bodyAlign: t.bodyAlign,
  address: t.address, website: t.website, email: t.email,
  title: t.title, subtitle: t.subtitle, bodyTemplate: t.bodyTemplate,
  signatures: t.signatures, dateLabel: t.dateLabel,
  showSerial: t.showSerial, showVerify: t.showVerify, showBorder: t.showBorder,
  isDefault: t.isDefault,
});

/* ═══════════════ ADMIN — TEMPLATES ═══════════════ */

export const listTemplates = asyncHandler(async (req, res) => {
  const items = await CertificateTemplate.find().sort('-isDefault name').lean();
  ok(res, { templates: items.map(tShape) });
});

export const createTemplate = asyncHandler(async (req, res) => {
  const t = await CertificateTemplate.create(req.body);
  ok(res, { template: tShape(t) }, 'Template created', 201);
});

export const updateTemplate = asyncHandler(async (req, res) => {
  const t = await CertificateTemplate.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!t) throw ApiError.notFound('Template not found.');
  ok(res, { template: tShape(t) }, 'Template updated');
});

export const deleteTemplate = asyncHandler(async (req, res) => {
  const t = await CertificateTemplate.findByIdAndDelete(req.params.id);
  if (!t) throw ApiError.notFound('Template not found.');
  ok(res, { deleted: true }, 'Template removed');
});

// Resolve asset URLs for a template (admin preview).
export const templateAssets = asyncHandler(async (req, res) => {
  const t = await CertificateTemplate.findById(req.params.id).lean();
  if (!t) throw ApiError.notFound('Template not found.');
  const sigs = await Promise.all((t.signatures || []).map(async (s) => ({ ...s, imageUrl: await assetUrl(s.image) })));
  ok(res, { logoUrl: await assetUrl(t.logo), additionalLogoUrl: await assetUrl(t.additionalLogo), signatures: sigs });
});

/* ═══════════════ ADMIN — ISSUE ═══════════════ */

// POST /api/admin/certificates  { studentId, courseId, batchId?, templateId, startDate?, endDate?, duration? }
export const issue = asyncHandler(async (req, res) => {
  const { studentId, courseId, batchId, templateId, startDate, endDate, duration } = req.body;
  if (!studentId || !courseId || !templateId) throw ApiError.badRequest('studentId, courseId and templateId are required.');

  const [student, course, template] = await Promise.all([
    User.findById(studentId).select('name email'),
    Course.findById(courseId).select('title'),
    CertificateTemplate.findById(templateId),
  ]);
  if (!student) throw ApiError.notFound('Student not found.');
  if (!course) throw ApiError.notFound('Course not found.');
  if (!template) throw ApiError.notFound('Template not found.');

  const existing = await Certificate.findOne({ student: studentId, course: courseId, status: 'issued' });
  if (existing) throw ApiError.conflict('A certificate has already been issued to this student for this course.');

  const enr = await Enrollment.findOne({ student: studentId, course: courseId }).populate('batch', 'code').lean();
  const vars = {
    studentName: student.name, courseName: course.title,
    batchCode: enr?.batch?.code || '', companyName: template.companyName,
    issueDate: fmtDate(new Date()), startDate: fmtDate(startDate), endDate: fmtDate(endDate),
    duration: duration || '',
  };

  let serialNo; // retry on the rare unique collision
  for (let i = 0; i < 5; i++) {
    serialNo = await nextSerial();
    if (!(await Certificate.exists({ serialNo }))) break;
  }
  vars.serialNo = serialNo;

  const snapshot = {
    companyName: template.companyName, accentColor: template.accentColor, secondaryColor: template.secondaryColor,
    titleColor: template.titleColor, bodyAlign: template.bodyAlign,
    address: template.address, website: template.website, email: template.email,
    title: fillPlaceholders(template.title, vars), subtitle: fillPlaceholders(template.subtitle, vars),
    body: fillPlaceholders(template.bodyTemplate, vars),
    dateLabel: template.dateLabel, showSerial: template.showSerial, showVerify: template.showVerify, showBorder: template.showBorder,
    logo: template.logo, additionalLogo: template.additionalLogo,
    signatures: template.signatures,
  };

  const cert = await Certificate.create({
    student: studentId, course: courseId, batch: batchId || enr?.batch?._id || null, template: templateId,
    serialNo, verifyCode: crypto.randomBytes(6).toString('hex'),
    studentName: student.name, courseName: course.title,
    type: template.type, orientation: template.orientation,
    startDate: startDate || null, endDate: endDate || null, duration: duration || '',
    snapshot, issuedBy: req.user._id,
  });
  ok(res, { certificate: { id: cert._id, serialNo: cert.serialNo, studentName: cert.studentName } }, 'Certificate issued', 201);
});

// GET /api/admin/certificates?course=&batch=
export const adminList = asyncHandler(async (req, res) => {
  const q = { status: 'issued' };
  if (req.query.course) q.course = req.query.course;
  if (req.query.batch) q.batch = req.query.batch;
  const items = await Certificate.find(q).select('student course serialNo studentName issueDate type').lean();
  ok(res, { certificates: items });
});

// DELETE /api/admin/certificates/:id  (revoke)
export const revoke = asyncHandler(async (req, res) => {
  const c = await Certificate.findByIdAndUpdate(req.params.id, { $set: { status: 'revoked' } }, { new: true });
  if (!c) throw ApiError.notFound('Certificate not found.');
  ok(res, { revoked: true }, 'Certificate revoked');
});

/* ═══════════════ STUDENT / RENDER / VERIFY ═══════════════ */

async function renderPayload(cert) {
  const s = cert.snapshot || {};
  const sigs = await Promise.all((s.signatures || []).map(async (x) => ({ name: x.name, role: x.role, imageUrl: await assetUrl(x.image) })));
  return {
    id: cert._id, serialNo: cert.serialNo, verifyCode: cert.verifyCode,
    studentName: cert.studentName, courseName: cert.courseName,
    type: cert.type, orientation: cert.orientation,
    issueDate: fmtDate(cert.issueDate), dateLabel: s.dateLabel || 'Date of Issue',
    startDate: fmtDate(cert.startDate), endDate: fmtDate(cert.endDate), duration: cert.duration,
    title: s.title, subtitle: s.subtitle, body: s.body,
    companyName: s.companyName, address: s.address, website: s.website, email: s.email,
    accentColor: s.accentColor, secondaryColor: s.secondaryColor, titleColor: s.titleColor, bodyAlign: s.bodyAlign,
    showSerial: s.showSerial, showVerify: s.showVerify, showBorder: s.showBorder,
    logoUrl: await assetUrl(s.logo), additionalLogoUrl: await assetUrl(s.additionalLogo),
    signatures: sigs,
  };
}

// GET /api/certificates/me
export const myCertificates = asyncHandler(async (req, res) => {
  const items = await Certificate.find({ student: req.user._id, status: 'issued' })
    .select('course courseName serialNo issueDate type orientation').lean();
  ok(res, { certificates: items.map((c) => ({ ...c, id: c._id })) });
});

// GET /api/certificates/:id/render  (owner or admin)
export const render = asyncHandler(async (req, res) => {
  const cert = await Certificate.findById(req.params.id);
  if (!cert || cert.status !== 'issued') throw ApiError.notFound('Certificate not found.');
  const isOwner = String(cert.student) === String(req.user._id);
  if (!isOwner && req.user.role !== 'admin') throw ApiError.forbidden('Not allowed.');
  ok(res, { certificate: await renderPayload(cert) });
});

// GET /api/certificates/verify/:code  (public)
export const verify = asyncHandler(async (req, res) => {
  const cert = await Certificate.findOne({ verifyCode: req.params.code }).lean();
  if (!cert || cert.status !== 'issued') return ok(res, { valid: false });
  ok(res, { valid: true, studentName: cert.studentName, courseName: cert.courseName,
    serialNo: cert.serialNo, issueDate: fmtDate(cert.issueDate), type: cert.type });
});
