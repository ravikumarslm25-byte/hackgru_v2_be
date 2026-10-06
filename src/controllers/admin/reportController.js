import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Batch } from '../../models/org/Batch.js';
import { Course } from '../../models/Course.js';
import { Enrollment } from '../../models/Enrollment.js';
import { RecordingProgress } from '../../models/RecordingProgress.js';
import { Test } from '../../models/Test.js';
import { TestAttempt } from '../../models/TestAttempt.js';
import { Problem } from '../../models/Problem.js';
import { CodeSubmission } from '../../models/CodeSubmission.js';
import { ProjectSubmission } from '../../models/ProjectSubmission.js';
import { Certificate } from '../../models/Certificate.js';
import { Order } from '../../models/Order.js';

const pct = (done, total) => (total > 0 ? Math.round((done / total) * 100) : 0);
const round = (n) => Math.round((n || 0) * 10) / 10;

// GET /api/admin/batches/:id/report
export const batchReport = asyncHandler(async (req, res) => {
  const batch = await Batch.findById(req.params.id)
    .populate('college', 'name code').populate('department', 'name code').lean();
  if (!batch) throw ApiError.notFound('Batch not found.');

  const course = await Course.findById(batch.course).select('title recordingSections').lean();
  const courseId = batch.course;

  // Content totals for this course — the denominators.
  const lessonsTotal = (course?.recordingSections || []).reduce((n, s) => n + (s.lessons?.length || 0), 0);
  const [testsTotal, problemsTotal] = await Promise.all([
    Test.countDocuments({ course: courseId, isPublished: true }),
    Problem.countDocuments({ course: courseId, isPublished: true }),
  ]);

  // Roster.
  const enrolments = await Enrollment.find({ batch: batch._id })
    .populate('student', 'name email registerNumber year').lean();
  const ids = enrolments.map((e) => e.student?._id).filter(Boolean);

  if (ids.length === 0) {
    return ok(res, {
      batch: { id: batch._id, code: batch.code, name: batch.name,
        college: batch.college, department: batch.department, course: course?.title,
        institutional: batch.institutional !== false },
      totals: { students: 0, lessonsTotal, testsTotal, problemsTotal },
      rows: [], summary: null,
    });
  }

  // Aggregations, keyed by student.
  const [recs, testAgg, coding, projects, certIds, orders] = await Promise.all([
    RecordingProgress.aggregate([
      { $match: { course: courseId, student: { $in: ids }, completed: true } },
      { $group: { _id: '$student', done: { $sum: 1 } } },
    ]),
    TestAttempt.aggregate([
      { $match: { course: courseId, student: { $in: ids } } },
      { $group: { _id: { student: '$student', test: '$test' }, best: { $max: '$percent' }, passed: { $max: { $cond: ['$passed', 1, 0] } } } },
      { $group: { _id: '$_id.student', attempted: { $sum: 1 }, avg: { $avg: '$best' }, passed: { $sum: '$passed' } } },
    ]),
    CodeSubmission.aggregate([
      { $match: { course: courseId, student: { $in: ids }, verdict: 'accepted' } },
      { $group: { _id: '$student', solved: { $addToSet: '$problem' } } },
      { $project: { solved: { $size: '$solved' } } },
    ]),
    ProjectSubmission.find({ course: courseId, student: { $in: ids } }).select('student status grade').lean(),
    Certificate.find({ course: courseId, student: { $in: ids }, status: 'issued' }).distinct('student'),
    Order.find({ student: { $in: ids }, course: courseId, status: 'paid' }).select('student amount').lean(),
  ]);

  const recMap = Object.fromEntries(recs.map((r) => [String(r._id), r.done]));
  const testMap = Object.fromEntries(testAgg.map((r) => [String(r._id), r]));
  const codeMap = Object.fromEntries(coding.map((r) => [String(r._id), r.solved]));
  const projMap = Object.fromEntries(projects.map((p) => [String(p.student), p]));
  const certSet = new Set(certIds.map(String));
  const paidMap = {};
  for (const o of orders) paidMap[String(o.student)] = (paidMap[String(o.student)] || 0) + (o.amount || 0);

  const rows = enrolments.map((e) => {
    const sid = String(e.student?._id);
    const done = recMap[sid] || 0;
    const t = testMap[sid] || { attempted: 0, avg: 0, passed: 0 };
    const solved = codeMap[sid] || 0;
    const proj = projMap[sid];
    return {
      student: { id: sid, name: e.student?.name, email: e.student?.email,
        registerNumber: e.student?.registerNumber || '', year: e.student?.year || '' },
      access: e.paid ? 'paid' : e.sponsored ? 'sponsored' : 'pending',
      recordings: { done, total: lessonsTotal, pct: pct(done, lessonsTotal) },
      tests: { attempted: t.attempted, total: testsTotal, avg: round(t.avg), passed: t.passed },
      coding: { solved, total: problemsTotal, pct: pct(solved, problemsTotal) },
      project: proj ? { status: proj.status, grade: proj.grade || '' } : null,
      certificate: certSet.has(sid),
      collected: paidMap[sid] || 0,
    };
  });

  // Batch-level summary (averages across students).
  const n = rows.length;
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const summary = {
    students: n,
    avgRecordings: pct(sum((r) => r.recordings.done), lessonsTotal * n),
    avgCoding: pct(sum((r) => r.coding.solved), problemsTotal * n),
    avgTestScore: round(sum((r) => r.tests.avg) / n),
    testsFullyAttempted: rows.filter((r) => testsTotal > 0 && r.tests.attempted >= testsTotal).length,
    certificates: rows.filter((r) => r.certificate).length,
    projectsSubmitted: rows.filter((r) => r.project).length,
    collected: sum((r) => r.collected),
  };

  ok(res, {
    batch: { id: batch._id, code: batch.code, name: batch.name,
      college: batch.college, department: batch.department, course: course?.title,
      institutional: batch.institutional !== false },
    totals: { students: n, lessonsTotal, testsTotal, problemsTotal },
    rows, summary,
  });
});
