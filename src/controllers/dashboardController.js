import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/ApiResponse.js';
import { Enrollment } from '../models/Enrollment.js';
import { Assessment } from '../models/Assessment.js';
import { CoursePrice } from '../models/org/CoursePrice.js';

// @route GET /api/dashboard  (student overview — aggregates for the dashboard cards)
export const getDashboard = asyncHandler(async (req, res) => {
  const all = await Enrollment.find({ student: req.user._id })
    .populate('course', 'title slug thumbnail totalLessons mode schedule price currency');

  // Unpaid registrations are shown separately — don't inflate "enrolled".
  // Sponsored (college-paid/free) enrolments count as active, never "pending".
  const enrollments = all.filter((e) => e.paid !== false || e.sponsored);
  const unpaid = all.filter((e) => e.paid === false && !e.sponsored && e.course);

  // Build the pending-payment list with the SAME price createOrder will charge,
  // so the card amount and the checkout amount can never disagree.
  const pendingPayments = await Promise.all(unpaid.map(async (e) => {
    const { price } = await CoursePrice.resolve({
      courseId: e.course._id,
      collegeId: req.user.college,
      coursePrice: e.course.price,
      linkOverride: null,
    });
    return {
      courseId: e.course._id,
      title: e.course.title,
      slug: e.course.slug,
      amount: price,
      currency: e.course.currency || 'INR',
    };
  }));

  const coursesEnrolled = enrollments.length;
  const completed = enrollments.filter((e) => e.status === 'completed').length;
  const avgProgress = coursesEnrolled
    ? Math.round(enrollments.reduce((s, e) => s + e.progress, 0) / coursesEnrolled)
    : 0;

  const latestAssessment = await Assessment.findOne({ student: req.user._id }).sort('-createdAt');

  ok(res, {
    stats: {
      coursesEnrolled,
      coursesCompleted: completed,
      avgProgress,
      skillScore: latestAssessment?.overallScore ?? null,
      pendingPayment: pendingPayments.length,
    },
    pendingPayments,
    profile: req.user.profileCompleteness(),
    continueLearning: enrollments
      .filter((e) => e.status === 'active')
      .sort((a, b) => b.lastAccessed - a.lastAccessed)
      .slice(0, 3),
    recommendedPath: latestAssessment?.recommendedPath ?? [],
  });
});
