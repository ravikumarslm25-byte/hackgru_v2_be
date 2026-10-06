import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { env } from '../../config/env.js';
import { College } from '../../models/org/College.js';
import { Department } from '../../models/org/Department.js';
import { Batch } from '../../models/org/Batch.js';
import { RegistrationLink } from '../../models/org/RegistrationLink.js';
import { Course } from '../../models/Course.js';
import { User } from '../../models/User.js';
import { generateBatchCode } from '../../services/org/batchCode.js';

/**
 * Join links are pasted into WhatsApp groups and printed on posters. They must
 * be built from the ONE canonical site url — never from the CORS list.
 */
const publicUrl = (token) => `${env.publicSiteUrl}/join/${token}`;

// @route POST /api/admin/registration-links
// Creates the link AND its batch — one link is one batch, always.
export const createLink = asyncHandler(async (req, res) => {
  const {
    institutional = true,
    collegeId, departmentId, departmentIds,
    courseId, batchName, academicYear, startDate, endDate,
    maxSeats, expiresAt, priceOverride = null, label = '',
    freeAccess = false, accessExpiresAt = null,
  } = req.body;

  if (!courseId) throw ApiError.badRequest('Course is required.');
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  const isInst = institutional !== false;
  let college = null, departments = [], primaryDept = null;
  let collegeCode = 'OPEN', deptCode = null;

  if (isInst) {
    // Accept either a single departmentId (back-compat) or an array of departmentIds.
    const ids = (Array.isArray(departmentIds) ? departmentIds : [])
      .concat(departmentId ? [departmentId] : [])
      .filter(Boolean);
    if (!collegeId) throw ApiError.badRequest('Select the college.');
    if (ids.length === 0) throw ApiError.badRequest('Select at least one department.');

    college = await College.findById(collegeId);
    if (!college) throw ApiError.notFound('College not found');
    departments = await Department.find({ _id: { $in: ids } });
    if (departments.length !== new Set(ids.map(String)).size) throw ApiError.badRequest('One or more departments were not found.');
    for (const d of departments) {
      if (String(d.college) !== String(college._id)) {
        throw ApiError.badRequest(`"${d.name}" is not a department of ${college.name}.`);
      }
    }
    primaryDept = departments[0];
    collegeCode = college.code;
    deptCode = departments.length === 1 ? primaryDept.code : 'MIX';
  }

  const code = await generateBatchCode({ collegeCode, departmentCode: deptCode, courseSlug: course.slug });
  const seats = maxSeats ? Number(maxSeats) : null;   // blank / 0 → unlimited

  const defaultName = isInst
    ? `${college.shortName || college.code} · ${deptCode} · ${course.title}`
    : `Open · ${course.title}`;

  const batch = await Batch.create({
    name: batchName || defaultName,
    code, institutional: isInst,
    college: college?._id || null,
    department: primaryDept?._id || null,
    departments: departments.map((d) => d._id),
    course: course._id,
    academicYear, startDate, endDate,
    seats,
    status: 'open',
    createdBy: req.user._id,
  });

  let link;
  try {
    link = await RegistrationLink.create({
      token: RegistrationLink.newToken(),
      institutional: isInst,
      college: college?._id || null,
      department: primaryDept?._id || null,
      departments: departments.map((d) => d._id),
      course: course._id, batch: batch._id,
      maxSeats: seats, expiresAt, priceOverride, label,
      freeAccess: Boolean(freeAccess), accessExpiresAt: accessExpiresAt ? new Date(accessExpiresAt) : null,
      createdBy: req.user._id,
    });
  } catch (err) {
    await Batch.deleteOne({ _id: batch._id });
    throw err;
  }

  ok(res, {
    link: { ...link.toObject(), url: publicUrl(link.token) },
    batch,
  }, 'Registration link created', 201);
});

// @route GET /api/admin/registration-links
export const listLinks = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.college) filter.college = req.query.college;
  if (req.query.active === 'true') filter.isActive = true;

  const links = await RegistrationLink.find(filter)
    .populate('college', 'name code shortName')
    .populate('department', 'name code')
    .populate('course', 'title slug price')
    .populate('batch', 'name code status stats seats')
    .sort('-createdAt')
    .lean();

  ok(res, {
    links: links.map((l) => ({
      ...l,
      url: publicUrl(l.token),
      seatsLeft: Math.max(0, l.maxSeats - l.usedSeats),
      expired: Boolean(l.expiresAt && new Date(l.expiresAt) < new Date()),
    })),
  });
});

// @route GET /api/admin/registration-links/:id
export const getLink = asyncHandler(async (req, res) => {
  const link = await RegistrationLink.findById(req.params.id)
    .populate('college', 'name code').populate('department', 'name code')
    .populate('course', 'title slug price').populate('batch', 'name code status stats seats');
  if (!link) throw ApiError.notFound('Registration link not found');

  // Who has actually come through this link
  const students = await User.find({ registrationLink: link._id })
    .select('name email phone registerNumber year createdAt')
    .sort('-createdAt').lean();

  ok(res, { link: { ...link.toObject(), url: publicUrl(link.token) }, students });
});

// @route PATCH /api/admin/registration-links/:id
export const updateLink = asyncHandler(async (req, res) => {
  const allowed = ['isActive', 'maxSeats', 'expiresAt', 'priceOverride', 'label'];
  const patch = {};
  for (const f of allowed) if (req.body[f] !== undefined) patch[f] = req.body[f];

  const link = await RegistrationLink.findById(req.params.id);
  if (!link) throw ApiError.notFound('Registration link not found');

  // Lowering the cap below what's already sold would make availability() lie.
  if (patch.maxSeats !== undefined && patch.maxSeats < link.usedSeats) {
    throw ApiError.badRequest(
      `${link.usedSeats} students have already registered — the seat cap can't be lower than that. ` +
      'Close the link instead if you want to stop new registrations.'
    );
  }

  Object.assign(link, patch);
  await link.save();
  if (patch.maxSeats !== undefined) await Batch.updateOne({ _id: link.batch }, { seats: patch.maxSeats });

  ok(res, { link: { ...link.toObject(), url: publicUrl(link.token) } }, 'Registration link updated');
});

// @route DELETE /api/admin/registration-links/:id — close, never delete
export const closeLink = asyncHandler(async (req, res) => {
  const link = await RegistrationLink.findById(req.params.id);
  if (!link) throw ApiError.notFound('Registration link not found');

  // Deleting would orphan the batch and every student who joined through it.
  link.isActive = false;
  await link.save();
  ok(res, { link }, 'Registration link closed. Existing registrations are unaffected.');
});
