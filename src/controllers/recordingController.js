import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Course } from '../models/Course.js';
import { Upload } from '../models/Upload.js';
import { Enrollment } from '../models/Enrollment.js';
import { RecordingProgress } from '../models/RecordingProgress.js';
import { can } from '../services/access/entitlements.js';
import { signedDownload } from '../services/storage/index.js';

// The student must at least be in the course (enrolled) to see the curriculum.
async function inCourse(studentId, courseId) {
  if (await can(studentId, 'live_cohort', courseId)) return true;
  const enr = await Enrollment.findOne({ student: studentId, course: courseId }).lean();
  return Boolean(enr);
}

// GET /api/recordings/:courseId — gated curriculum + progress (NO video URLs here).
export const getCurriculum = asyncHandler(async (req, res) => {
  const courseId = req.params.courseId;
  const course = await Course.findById(courseId).select('title recordingSections');
  if (!course) throw ApiError.notFound('Course not found.');

  const enrolled = await inCourse(req.user._id, courseId);
  const hasRecordings = await can(req.user._id, 'recordings', courseId);

  const progressRows = await RecordingProgress.find({ student: req.user._id, course: courseId }).lean();
  const progById = Object.fromEntries(progressRows.map((p) => [String(p.lesson), { positionSec: p.positionSec, completed: p.completed }]));

  const sections = (course.recordingSections || []).sort((a, b) => a.order - b.order).map((s) => ({
    id: s._id, title: s.title,
    lessons: (s.lessons || []).sort((a, b) => a.order - b.order).map((l) => {
      const playable = l.isPreview || hasRecordings;
      const prog = progById[String(l._id)] || { positionSec: 0, completed: false };
      return {
        id: l._id, title: l.title, durationSec: l.durationSec, isPreview: l.isPreview,
        hasVideo: Boolean(l.video), locked: !playable,
        positionSec: prog.positionSec, completed: prog.completed,
      };
    }),
  }));

  ok(res, { course: { id: course._id, title: course.title }, enrolled, hasRecordings, sections });
});

// GET /api/recordings/:courseId/lesson/:lessonId/url — a fresh, short-lived signed URL,
// issued only when the student actually opens a lesson they're allowed to watch. The URL
// lives just long enough to watch the lesson (never a fixed long window), so a copied link
// stops working quickly and can't be handed around.
export const getLessonUrl = asyncHandler(async (req, res) => {
  const { courseId, lessonId } = req.params;
  const course = await Course.findById(courseId).select('recordingSections');
  if (!course) throw ApiError.notFound('Course not found.');

  let lesson = null;
  for (const s of course.recordingSections || []) {
    const found = (s.lessons || []).id(lessonId);
    if (found) { lesson = found; break; }
  }
  if (!lesson || !lesson.video) throw ApiError.notFound('Lesson video not found.');

  const playable = lesson.isPreview || (await can(req.user._id, 'recordings', courseId));
  if (!playable) throw ApiError.forbidden('You need recordings access to watch this lesson.');
  if (!(await inCourse(req.user._id, courseId))) throw ApiError.forbidden('Not enrolled in this course.');

  const up = await Upload.findById(lesson.video);
  if (!up) throw ApiError.notFound('Lesson video not found.');
  // Expiry = ~1.5× the lesson length, clamped to [10 min, 4 h].
  const expiresIn = Math.min(Math.max(Math.round((lesson.durationSec || 0) * 1.5), 600), 14400);
  const url = await signedDownload(up, { inline: true, expiresIn });
  ok(res, { url, expiresIn });
});

// POST /api/recordings/:courseId/progress  { lessonId, positionSec?, completed? }
export const saveProgress = asyncHandler(async (req, res) => {
  const { lessonId, positionSec, completed } = req.body;
  if (!lessonId) throw ApiError.badRequest('lessonId is required.');
  const set = {};
  if (positionSec != null) set.positionSec = Math.max(0, Math.round(positionSec));
  if (completed != null) set.completed = !!completed;
  const row = await RecordingProgress.findOneAndUpdate(
    { student: req.user._id, course: req.params.courseId, lesson: lessonId },
    { $set: set },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  ok(res, { progress: { lesson: row.lesson, positionSec: row.positionSec, completed: row.completed } });
});
