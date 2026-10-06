import crypto from 'crypto';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { User } from '../../models/User.js';
import { Batch } from '../../models/org/Batch.js';
import { RegistrationLink } from '../../models/org/RegistrationLink.js';
import { Enrollment } from '../../models/Enrollment.js';
import { grantStudentAccessForLink } from '../../services/org/batchAccess.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Accepts messy header variants and returns a clean row. */
function normalizeRow(raw = {}) {
  const map = {};
  for (const [k, v] of Object.entries(raw)) {
    map[String(k).toLowerCase().replace(/[^a-z0-9]/g, '')] = typeof v === 'string' ? v.trim() : v;
  }
  return {
    name: map.name || map.fullname || map.studentname || '',
    email: String(map.email || map.emailid || map.mail || '').toLowerCase().trim(),
    phone: map.phone || map.mobile || map.phonenumber || '',
    registerNumber: map.registernumber || map.rollnumber || map.roll || map.regno || map.registerno || '',
    year: String(map.year || map.yearofstudy || '').trim(),
    department: map.department || map.dept || map.branch || '',
  };
}

async function loadBatchLink(batchId) {
  const batch = await Batch.findById(batchId).lean();
  if (!batch) throw ApiError.notFound('Batch not found.');
  const link = await RegistrationLink.findOne({ batch: batchId }).populate('departments', 'name code').populate('course', 'title slug').lean();
  if (!link) throw ApiError.badRequest('This batch has no registration link.');
  return { batch, link };
}

function resolveDept(link, deptText) {
  if (!deptText || !(link.departments || []).length) return null;
  const t = String(deptText).toLowerCase().trim();
  const hit = link.departments.find((d) => d.code?.toLowerCase() === t || d.name?.toLowerCase() === t);
  return hit?._id || null;
}

/**
 * Validate rows against the batch. Pure analysis — no writes. Returns a per-row
 * verdict the admin previews before committing.
 */
async function analyze(batch, link, rows) {
  const norm = rows.map(normalizeRow);
  const emails = norm.map((r) => r.email).filter(Boolean);
  const existing = await User.find({ email: { $in: emails } }).select('email college role').lean();
  const byEmail = Object.fromEntries(existing.map((u) => [u.email, u]));
  const existingIds = existing.map((u) => u._id);
  const enrolled = await Enrollment.find({ course: link.course._id, student: { $in: existingIds } }).select('student').lean();
  const enrolledSet = new Set(enrolled.map((e) => String(e.student)));

  // Seat headroom (unlimited when maxSeats is null/0).
  const cap = link.maxSeats || null;
  const currentActive = await Enrollment.countDocuments({ batch: batch._id });
  let willAdd = 0;

  const seen = new Set();
  const isInst = batch.institutional !== false;

  const analysis = norm.map((r, i) => {
    const line = i + 2; // header is row 1
    const base = { line, name: r.name, email: r.email, registerNumber: r.registerNumber, department: r.department };
    if (!r.name || !r.email) return { ...base, status: 'skip', reason: 'Missing name or email' };
    if (!EMAIL_RE.test(r.email)) return { ...base, status: 'skip', reason: 'Invalid email' };
    if (seen.has(r.email)) return { ...base, status: 'skip', reason: 'Duplicate row in file' };
    seen.add(r.email);

    const u = byEmail[r.email];
    if (u) {
      if (u.role && u.role !== 'student') return { ...base, status: 'skip', reason: 'Email belongs to a staff/admin account' };
      if (isInst && u.college && String(u.college) !== String(batch.college)) {
        return { ...base, status: 'skip', reason: 'Account belongs to another college' };
      }
      if (enrolledSet.has(String(u._id))) return { ...base, status: 'skip', reason: 'Already in this course' };
      willAdd += 1;
      if (cap && currentActive + willAdd > cap) return { ...base, status: 'skip', reason: 'Batch is full' };
      return { ...base, status: 'existing', reason: 'Existing account — will be enrolled' };
    }
    willAdd += 1;
    if (cap && currentActive + willAdd > cap) return { ...base, status: 'skip', reason: 'Batch is full' };
    return { ...base, status: 'new', reason: 'New account — will be created' };
  });

  const summary = analysis.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, { new: 0, existing: 0, skip: 0 });
  return { analysis, summary };
}

// POST /api/admin/batches/:id/students/preview   { rows: [...] }
export const preview = asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) throw ApiError.badRequest('No rows to preview. Upload a CSV or Excel file.');
  if (rows.length > 2000) throw ApiError.badRequest('Please upload at most 2000 rows at a time.');
  const { batch, link } = await loadBatchLink(req.params.id);
  const { analysis, summary } = await analyze(batch, link, rows);
  ok(res, { analysis, summary, freeAccess: Boolean(link.freeAccess), institutional: batch.institutional !== false });
});

// POST /api/admin/batches/:id/students/commit   { rows: [...] }
export const commit = asyncHandler(async (req, res) => {
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (!rows.length) throw ApiError.badRequest('No rows to import.');
  if (rows.length > 2000) throw ApiError.badRequest('Please upload at most 2000 rows at a time.');
  const { batch, link } = await loadBatchLink(req.params.id);
  const { analysis } = await analyze(batch, link, rows);
  const normById = analysis.map((a, i) => ({ ...a, norm: normalizeRow(rows[i]) }));

  const created = [];   // { name, email, password }
  const enrolledExisting = [];
  const skipped = [];
  let firstRegistered = 0;

  for (const r of normById) {
    if (r.status === 'skip') { skipped.push({ name: r.name, email: r.email, reason: r.reason }); continue; }

    const isInst = batch.institutional !== false;
    const deptId = isInst ? (resolveDept(link, r.norm.department) || link.department || (link.departments?.[0]?._id ?? null)) : null;

    let studentId;
    if (r.status === 'new') {
      const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'Hg' + Date.now().toString(36);
      const user = await User.create({
        name: r.norm.name, email: r.email, phone: r.norm.phone, password: tempPassword,
        role: 'student',
        emailVerified: true, emailVerifiedAt: new Date(),   // admin-vouched; can log in immediately
        college: isInst ? batch.college : null,
        department: deptId,
        registerNumber: r.norm.registerNumber ? String(r.norm.registerNumber).toUpperCase() : '',
        year: r.norm.year || '',
        registrationSource: 'bulk',
        registrationLink: link._id,
        institution: isInst ? undefined : (r.norm.department || ''),
      });
      studentId = user._id;
      created.push({ name: user.name, email: user.email, password: tempPassword, registerNumber: user.registerNumber });
    } else {
      // existing account → enrol it (and attach to college if it had none)
      const u = await User.findOne({ email: r.email });
      studentId = u._id;
      if (isInst && !u.college) { u.college = batch.college; u.department = deptId; await u.save(); }
      enrolledExisting.push({ name: u.name, email: u.email });
    }

    const enr = await Enrollment.findOneAndUpdate(
      { student: studentId, course: link.course._id },
      { $setOnInsert: { student: studentId, course: link.course._id, batch: batch._id, registrationLink: link._id, paid: false } },
      { upsert: true, new: true, setDefaultsOnInsert: true, rawResult: true },
    );
    if (enr.lastErrorObject?.updatedExisting === false) firstRegistered += 1;

    if (link.freeAccess) {
      try { await grantStudentAccessForLink(studentId, { ...link, _id: link._id }); } catch { /* non-fatal */ }
    }
  }

  if (firstRegistered) await Batch.updateOne({ _id: batch._id }, { $inc: { 'stats.registered': firstRegistered } });

  ok(res, {
    created, enrolledExisting, skipped,
    summary: { created: created.length, enrolledExisting: enrolledExisting.length, skipped: skipped.length },
    freeAccess: Boolean(link.freeAccess),
  }, `Imported ${created.length + enrolledExisting.length} student(s)`);
});
