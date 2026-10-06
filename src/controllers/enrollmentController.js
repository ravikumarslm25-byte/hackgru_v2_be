import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Enrollment } from '../models/Enrollment.js';
import { Course } from '../models/Course.js';
import { Entitlement } from '../models/Entitlement.js';

// @route GET /api/enrollments/me
export const getMyEnrollments = asyncHandler(async (req, res) => {
  // Self-heal: any course the student has an active entitlement for must be
  // reachable here. (Covers product purchases and admin grants that created an
  // entitlement but no enrolment.) Idempotent via the unique student+course index.
  const ents = await Entitlement.find({
    student: req.user._id, active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).select('course').lean();
  const entCourses = [...new Set(ents.map((e) => String(e.course)).filter(Boolean))];
  if (entCourses.length) {
    const have = await Enrollment.find({ student: req.user._id, course: { $in: entCourses } }).select('course').lean();
    const haveSet = new Set(have.map((h) => String(h.course)));
    for (const courseId of entCourses) {
      if (!haveSet.has(courseId)) {
        try { await Enrollment.create({ student: req.user._id, course: courseId, paid: true, paidAt: new Date() }); } catch { /* race: unique index */ }
      }
    }
  }

  const enrollments = await Enrollment.find({ student: req.user._id })
    .populate('course', 'title slug thumbnail totalLessons level price mode schedule durationWeeks')
    .populate('batch', 'name code startDate status')
    .sort('-lastAccessed');
  ok(res, { enrollments });
});

// @route POST /api/enrollments  { courseId }
export const enroll = asyncHandler(async (req, res) => {
  const { courseId } = req.body;
  const course = await Course.findById(courseId);
  if (!course) throw ApiError.notFound('Course not found');

  const existing = await Enrollment.findOne({ student: req.user._id, course: courseId });
  if (existing) throw ApiError.conflict('Already enrolled in this course');

  const enrollment = await Enrollment.create({ student: req.user._id, course: courseId });
  ok(res, { enrollment }, 'Enrolled successfully', 201);
});

// @route PATCH /api/enrollments/:id/progress  { lessonId }
export const updateProgress = asyncHandler(async (req, res) => {
  const enrollment = await Enrollment.findOne({ _id: req.params.id, student: req.user._id }).populate('course', 'totalLessons');
  if (!enrollment) throw ApiError.notFound('Enrollment not found');

  const { lessonId } = req.body;
  if (lessonId && !enrollment.completedLessons.includes(lessonId)) {
    enrollment.completedLessons.push(lessonId);
  }
  const total = enrollment.course.totalLessons || 1;
  enrollment.progress = Math.min(100, Math.round((enrollment.completedLessons.length / total) * 100));
  enrollment.status = enrollment.progress >= 100 ? 'completed' : 'active';
  enrollment.lastAccessed = Date.now();
  await enrollment.save();
  ok(res, { enrollment }, 'Progress updated');
});
