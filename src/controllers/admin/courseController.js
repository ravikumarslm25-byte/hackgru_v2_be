import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Course } from '../../models/Course.js';
import { CoursePrice } from '../../models/org/CoursePrice.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Batch } from '../../models/org/Batch.js';
import { College } from '../../models/org/College.js';

const slugify = (s) => String(s).toLowerCase().trim()
  .replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

// @route GET /api/admin/courses — every course, published or not
export const listCourses = asyncHandler(async (_req, res) => {
  const courses = await Course.find().sort('-createdAt').lean();
  const ids = courses.map((c) => c._id);
  const [enrol, batches, prices] = await Promise.all([
    Enrollment.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: '$course', n: { $sum: 1 } } }]),
    Batch.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: '$course', n: { $sum: 1 } } }]),
    CoursePrice.aggregate([{ $match: { course: { $in: ids } } }, { $group: { _id: '$course', n: { $sum: 1 } } }]),
  ]);
  const map = (r) => Object.fromEntries(r.map((x) => [String(x._id), x.n]));
  const e = map(enrol), b = map(batches), p = map(prices);

  ok(res, {
    courses: courses.map((c) => ({
      ...c,
      enrolmentCount: e[String(c._id)] || 0,
      batchCount: b[String(c._id)] || 0,
      collegePriceCount: p[String(c._id)] || 0,
    })),
  });
});

// @route GET /api/admin/courses/:id
export const getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id).lean();
  if (!course) throw ApiError.notFound('Course not found');
  const prices = await CoursePrice.find({ course: course._id }).populate('college', 'name code').lean();
  const enrolmentCount = await Enrollment.countDocuments({ course: course._id });
  ok(res, { course, prices, enrolmentCount });
});

// @route POST /api/admin/courses
export const createCourse = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (!body.title) throw ApiError.badRequest('Title is required.');
  body.slug = body.slug ? slugify(body.slug) : slugify(body.title);
  if (await Course.exists({ slug: body.slug })) {
    throw ApiError.conflict(`The web address "${body.slug}" is already used by another course.`);
  }
  const course = await Course.create(body);
  ok(res, { course }, 'Course created', 201);
});

// @route PUT /api/admin/courses/:id
export const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');

  const body = { ...req.body };
  if (body.slug) {
    body.slug = slugify(body.slug);
    if (body.slug !== course.slug && await Course.exists({ slug: body.slug })) {
      throw ApiError.conflict(`The web address "${body.slug}" is already taken.`);
    }
  }
  // Changing the price never touches money already collected — orders store the
  // amount they were paid at.
  Object.assign(course, body);
  await course.save();
  ok(res, { course }, 'Course updated');
});

// @route PATCH /api/admin/courses/:id/publish  { isPublished }
export const setPublished = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  course.isPublished = Boolean(req.body.isPublished);
  await course.save();
  ok(res, { course },
    course.isPublished
      ? 'Course is now visible on the website.'
      : 'Course hidden from the website. Existing students keep their access, and college links still work.');
});

// @route DELETE /api/admin/courses/:id
export const deleteCourse = asyncHandler(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');

  const [enrolments, batches] = await Promise.all([
    Enrollment.countDocuments({ course: course._id }),
    Batch.countDocuments({ course: course._id }),
  ]);

  // Deleting a course with students would orphan their enrolments and their
  // payment history. Refuse, and offer the thing they actually want.
  if (enrolments > 0 || batches > 0) {
    throw ApiError.badRequest(
      `This course has ${enrolments} student${enrolments === 1 ? '' : 's'} and ${batches} batch${batches === 1 ? '' : 'es'}. ` +
      'Deleting it would orphan their enrolments and payment records. ' +
      'Hide it from the website instead — existing students keep their access.'
    );
  }

  await CoursePrice.deleteMany({ course: course._id });
  await course.deleteOne();
  ok(res, {}, 'Course deleted.');
});

/* ───────────────── college pricing ───────────────── */

// @route PUT /api/admin/courses/:id/pricing  { college, price, note }
export const setCollegePrice = asyncHandler(async (req, res) => {
  const { college, price, note = '' } = req.body;
  const course = await Course.findById(req.params.id);
  if (!course) throw ApiError.notFound('Course not found');
  if (!(await College.exists({ _id: college }))) throw ApiError.notFound('College not found');
  if (price == null || price < 0) throw ApiError.badRequest('A price is required.');

  const row = await CoursePrice.findOneAndUpdate(
    { course: course._id, college },
    { price, note, createdBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).populate('college', 'name code');

  ok(res, { price: row },
    `${row.college.name} will pay ₹${price.toLocaleString('en-IN')} for this course. ` +
    'New registration links inherit it automatically.');
});

// @route DELETE /api/admin/courses/:id/pricing/:collegeId
export const removeCollegePrice = asyncHandler(async (req, res) => {
  await CoursePrice.deleteOne({ course: req.params.id, college: req.params.collegeId });
  ok(res, {}, 'Negotiated price removed. That college now pays the list price.');
});
