import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Resume } from '../models/Resume.js';
import { User } from '../models/User.js';
import { Upload } from '../models/Upload.js';
import { signedDownload } from '../services/storage/index.js';

/** The catalogue. Adding an 11th template = one entry + one component. */
export const TEMPLATES = [
  { id: 'modern',    name: 'Modern',    blurb: 'Clean sans-serif with an accent rule. Safe everywhere.', ats: true,  columns: 1 },
  { id: 'classic',   name: 'Classic',   blurb: 'Serif, conservative. The one campus placement cells expect.', ats: true, columns: 1 },
  { id: 'minimal',   name: 'Minimal',   blurb: 'Whitespace and typography. Nothing to distract.', ats: true, columns: 1 },
  { id: 'sidebar',   name: 'Sidebar',   blurb: 'Dark rail for contact and skills, content on the right.', ats: false, columns: 2 },
  { id: 'compact',   name: 'Compact',   blurb: 'Dense. Fits a lot on one page without shouting.', ats: true, columns: 1 },
  { id: 'timeline',  name: 'Timeline',  blurb: 'A vertical rail through your history.', ats: false, columns: 1 },
  { id: 'bold',      name: 'Bold',      blurb: 'Large name, heavy section rules. Hard to ignore.', ats: true, columns: 1 },
  { id: 'technical', name: 'Technical', blurb: 'Monospace accents. Built for developers.', ats: true, columns: 1 },
  { id: 'elegant',   name: 'Elegant',   blurb: 'Serif headings, letter-spaced. Quietly formal.', ats: true, columns: 1 },
  { id: 'split',     name: 'Split',     blurb: 'Two columns with a tinted header band.', ats: false, columns: 2 },
];
const TEMPLATE_IDS = new Set(TEMPLATES.map((t) => t.id));

/**
 * Resolve the photo to a URL the browser can show.
 *
 * 'profile' follows the profile photo, so changing it there updates every
 * résumé automatically — a student shouldn't have to remember two places.
 *
 * 15 minutes, not 5: this is displayed inline, and a student who fills in a form
 * for ten minutes and then prints must not get a broken image on their résumé.
 * Still short enough that a copied URL stops working. (The 900s ceiling is
 * asserted by a test — don't raise it for convenience.)
 */
async function photoUrlFor(resume, user) {
  const mode = resume.basics?.photoMode || 'profile';
  if (mode === 'none') return null;

  const uploadId = mode === 'custom' ? resume.basics?.photoUpload : user?.photoUpload;
  if (!uploadId) return null;

  const up = await Upload.findById(uploadId);
  if (!up || up.status !== 'ready') return null;
  // Never let a signing failure blank the whole résumé.
  return signedDownload(up, { inline: true, expiresIn: 900 }).catch(() => null);
}

/** Seed a new resume from the profile, so the form isn't a blank page. */
const seedFrom = (user) => ({
  student: user._id,
  basics: {
    fullName: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
    headline: user.track ? `${user.track} track` : '',
  },
  education: user.institution
    ? [{ institution: user.institution, degree: '', from: '', to: user.year ? `Year ${user.year}` : '' }]
    : [],
});

// @route GET /api/resume/templates  (public — the marketing page can list them)
export const listTemplates = asyncHandler(async (_req, res) => ok(res, { templates: TEMPLATES }));

// @route GET /api/resume/me
export const getMyResume = asyncHandler(async (req, res) => {
  let resume = await Resume.findOne({ student: req.user._id });
  if (!resume) resume = await Resume.create(seedFrom(req.user));

  // A view is the student opening their own resume — count it for analytics,
  // but don't let a counter failure block them seeing it.
  Resume.updateOne({ _id: resume._id },
    { $inc: { 'stats.views': 1 }, $set: { 'stats.lastOpenedAt': new Date() } }).catch(() => {});

  const photoUrl = await photoUrlFor(resume, req.user);
  ok(res, {
    resume: { ...resume.toObject(), photoUrl },
    hasProfilePhoto: Boolean(req.user.photoUpload),
    completeness: resume.completeness(), templates: TEMPLATES,
  });
});

// @route PUT /api/resume/me
export const saveMyResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOne({ student: req.user._id }) || await Resume.create(seedFrom(req.user));

  const FIELDS = ['basics', 'skills', 'experience', 'education', 'projects',
                  'certifications', 'achievements', 'sectionOrder', 'accent'];
  for (const f of FIELDS) if (req.body[f] !== undefined) resume[f] = req.body[f];

  if (req.body.template !== undefined) {
    if (!TEMPLATE_IDS.has(req.body.template)) throw ApiError.badRequest('Unknown template.');
    if (req.body.template !== resume.template) {
      resume.stats.templateSwitches += 1;
      if (!resume.templatesUsed.includes(req.body.template)) resume.templatesUsed.push(req.body.template);
    }
    resume.template = req.body.template;
  }

  await resume.save();
  const photoUrl = await photoUrlFor(resume, req.user);
  ok(res, {
    resume: { ...resume.toObject(), photoUrl },
    hasProfilePhoto: Boolean(req.user.photoUpload),
    completeness: resume.completeness(),
  }, 'Saved');
});

// @route POST /api/resume/me/downloaded — the client tells us it printed
export const trackDownload = asyncHandler(async (req, res) => {
  await Resume.updateOne({ student: req.user._id },
    { $inc: { 'stats.downloads': 1 }, $set: { 'stats.lastDownloadedAt': new Date() } });
  ok(res, {});
});

/* ─────────────────────────── admin ─────────────────────────── */

// @route GET /api/admin/resumes
export const listResumes = asyncHandler(async (req, res) => {
  const { q, template, college, page = 1, limit = 25 } = req.query;

  const filter = {};
  if (template) filter.template = template;
  if (q || college) {
    const userFilter = { role: 'student' };
    if (college) userFilter.college = college;
    if (q) userFilter.$or = [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') },
                             { registerNumber: new RegExp(q, 'i') }];
    filter.student = { $in: await User.find(userFilter).distinct('_id') };
  }

  const [rows, total] = await Promise.all([
    Resume.find(filter)
      .populate({ path: 'student', select: 'name email registerNumber college department',
                  populate: [{ path: 'college', select: 'name code' }, { path: 'department', select: 'code' }] })
      .sort('-updatedAt').skip((page - 1) * limit).limit(Number(limit)),
    Resume.countDocuments(filter),
  ]);

  ok(res, {
    resumes: rows.map((r) => ({
      id: r._id, student: r.student, template: r.template,
      completeness: r.completeness().percent,
      stats: r.stats, updatedAt: r.updatedAt,
    })),
    total, page: Number(page), pages: Math.ceil(total / limit),
  });
});

// @route GET /api/admin/resumes/:id — the full resume, to view as the student sees it
export const getResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findById(req.params.id)
    .populate({ path: 'student', select: 'name email phone registerNumber year college department',
                populate: [{ path: 'college', select: 'name code' }, { path: 'department', select: 'name code' }] });
  if (!resume) throw ApiError.notFound('Resume not found');
  // The admin must see exactly what the student sees — photo included.
  const owner = await User.findById(resume.student).select('photoUpload');
  const photoUrl = await photoUrlFor(resume, owner);
  ok(res, {
    resume: { ...resume.toObject(), photoUrl },
    completeness: resume.completeness(), templates: TEMPLATES,
  });
});

// @route GET /api/admin/resumes/analytics
export const resumeAnalytics = asyncHandler(async (_req, res) => {
  const [totalStudents, totalResumes, byTemplate, agg, recent] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    Resume.countDocuments(),
    Resume.aggregate([{ $group: { _id: '$template', n: { $sum: 1 },
      downloads: { $sum: '$stats.downloads' } } }, { $sort: { n: -1 } }]),
    Resume.aggregate([{ $group: {
      _id: null,
      views: { $sum: '$stats.views' },
      downloads: { $sum: '$stats.downloads' },
      switches: { $sum: '$stats.templateSwitches' },
      everDownloaded: { $sum: { $cond: [{ $gt: ['$stats.downloads', 0] }, 1, 0] } },
    } }]),
    Resume.find().populate('student', 'name registerNumber')
      .sort('-updatedAt').limit(6).select('student template stats updatedAt'),
  ]);

  // Completeness has to be computed, not aggregated — it's a method, and the
  // weights live in one place on purpose.
  const all = await Resume.find().select('basics skills experience education projects certifications achievements');
  const percents = all.map((r) => r.completeness().percent);
  const avg = percents.length ? Math.round(percents.reduce((a, b) => a + b, 0) / percents.length) : 0;
  const bands = { '0-25': 0, '26-50': 0, '51-75': 0, '76-99': 0, '100': 0 };
  percents.forEach((p) => {
    if (p === 100) bands['100'] += 1;
    else if (p > 75) bands['76-99'] += 1;
    else if (p > 50) bands['51-75'] += 1;
    else if (p > 25) bands['26-50'] += 1;
    else bands['0-25'] += 1;
  });

  const a = agg[0] || {};
  ok(res, {
    totals: {
      students: totalStudents,
      started: totalResumes,
      // The number that matters: how many students actually got a resume OUT.
      completed: a.everDownloaded || 0,
      adoption: totalStudents ? Math.round((totalResumes / totalStudents) * 100) : 0,
      views: a.views || 0, downloads: a.downloads || 0, switches: a.switches || 0,
      avgCompleteness: avg,
    },
    byTemplate: byTemplate.map((t) => ({
      template: t._id, count: t.n, downloads: t.downloads,
      name: TEMPLATES.find((x) => x.id === t._id)?.name || t._id,
    })),
    bands,
    recent,
  });
});
