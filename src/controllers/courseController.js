import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Course } from '../models/Course.js';
import { Enrollment } from '../models/Enrollment.js';

// @route GET /api/courses?tag=&mode=
export const getCourses = asyncHandler(async (req, res) => {
  const filter = { isPublished: true };
  if (req.query.tag) filter.tags = req.query.tag;
  if (req.query.mode) filter.mode = req.query.mode;
  const courses = await Course.find(filter)
    .populate('program', 'title slug category')
    .sort('createdAt');
  ok(res, { courses });
});

// @route GET /api/courses/:slug
export const getCourse = asyncHandler(async (req, res) => {
  const course = await Course.findOne({ slug: req.params.slug }).populate('program', 'title slug category');
  if (!course) throw ApiError.notFound('Course not found');

  // If logged in, tell the client whether they already own it
  let enrolled = false;
  if (req.user) {
    enrolled = Boolean(await Enrollment.findOne({ student: req.user._id, course: course._id }));
  }
  ok(res, { course, enrolled });
});

// @route POST /api/courses (admin/instructor)
export const createCourse = asyncHandler(async (req, res) => {
  const course = await Course.create(req.body);
  ok(res, { course }, 'Course created', 201);
});

// @route PUT /api/courses/:id (admin/instructor)
export const updateCourse = asyncHandler(async (req, res) => {
  const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!course) throw ApiError.notFound('Course not found');
  ok(res, { course }, 'Course updated');
});
