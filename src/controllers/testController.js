import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Test } from '../models/Test.js';
import { TestAttempt } from '../models/TestAttempt.js';
import { Enrollment } from '../models/Enrollment.js';
import { can } from '../services/access/entitlements.js';

async function inCourse(studentId, courseId) {
  if (await can(studentId, 'live_cohort', courseId)) return true;
  return Boolean(await Enrollment.findOne({ student: studentId, course: courseId }).lean());
}
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const totalMarks = (qs) => (qs || []).reduce((n, q) => n + (q.marks || 0), 0);
// Section-aware total for a full (lean) test: choose-N sections count only N × marks.
const sectionTotal = (t) => {
  const secs = t.sections || [];
  if (secs.length === 0) return totalMarks(t.questions);
  let total = 0;
  for (const sec of secs) {
    const given = (t.questions || []).filter((q) => String(q.section) === String(sec._id)).length;
    const n = sec.answerCount > 0 ? Math.min(sec.answerCount, given) : given;
    total += n * (sec.marksPerQuestion || 0);
  }
  total += (t.questions || []).filter((q) => !q.section).reduce((n, q) => n + (q.marks || 0), 0);
  return total;
};

// GET /api/tests/course/:courseId — published tests for a course + the student's best result.
export const listForCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const hasAccess = await can(req.user._id, 'mock_tests', courseId);
  const tests = await Test.find({ course: courseId, isPublished: true }).sort('order -createdAt').lean();
  const attempts = await TestAttempt.find({ student: req.user._id, course: courseId }).lean();
  const byTest = {};
  for (const a of attempts) {
    (byTest[a.test] ||= []).push(a);
  }
  const items = tests.map((t) => {
    const mine = byTest[t._id] || [];
    const best = mine.reduce((b, a) => (a.percent > (b?.percent ?? -1) ? a : b), null);
    return {
      id: t._id, title: t.title, description: t.description,
      questionCount: t.questions?.length || 0, totalMarks: sectionTotal(t),
      durationMin: t.durationMin, passPercent: t.passPercent, attemptsAllowed: t.attemptsAllowed,
      isFree: t.isFree, locked: !(t.isFree || hasAccess),
      proctored: !!t.proctoring?.enabled,
      attemptsUsed: mine.length,
      best: best ? { percent: Math.round(best.percent), passed: best.passed, score: best.score } : null,
    };
  });
  ok(res, { hasAccess, tests: items });
});

// GET /api/tests/:id/take — the test WITHOUT correct answers, for attempting.
export const getForTaking = asyncHandler(async (req, res) => {
  const t = await Test.findById(req.params.id).lean();
  if (!t || !t.isPublished) throw ApiError.notFound('Test not available.');
  if (!(await inCourse(req.user._id, t.course))) throw ApiError.forbidden('Not enrolled in this course.');
  const allowed = t.isFree || (await can(req.user._id, 'mock_tests', t.course));
  if (!allowed) throw ApiError.forbidden('You need mock-tests access for this test.');

  if (t.attemptsAllowed > 0) {
    const used = await TestAttempt.countDocuments({ student: req.user._id, test: t._id });
    if (used >= t.attemptsAllowed) throw ApiError.badRequest(`You've used all ${t.attemptsAllowed} attempts.`);
  }

  let qs = (t.questions || []).slice().sort((a, b) => a.order - b.order);
  if (t.shuffleQuestions) qs = shuffle(qs);
  const questions = qs.map((q) => ({
    id: q._id, text: q.text, type: q.type, marks: q.marks, section: q.section || null,
    options: (t.shuffleOptions ? shuffle(q.options) : q.options).map((o) => ({ id: o._id, text: o.text })),
  }));
  ok(res, { test: {
    id: t._id, course: t.course, title: t.title, description: t.description,
    durationMin: t.durationMin, passPercent: t.passPercent, totalMarks: sectionTotal(t),
    negativeMarkPerWrong: t.negativeMarkPerWrong, sections: t.sections || [], questions,
  } });
});

// POST /api/tests/:id/submit  { answers: [{ question, selected: [] }], durationTakenSec }
export const submit = asyncHandler(async (req, res) => {
  const t = await Test.findById(req.params.id);
  if (!t || !t.isPublished) throw ApiError.notFound('Test not available.');
  if (!(await inCourse(req.user._id, t.course))) throw ApiError.forbidden('Not enrolled in this course.');
  const allowed = t.isFree || (await can(req.user._id, 'mock_tests', t.course));
  if (!allowed) throw ApiError.forbidden('You need mock-tests access for this test.');

  const g = gradeAttempt(t, req.body.answers);
  const attempt = await TestAttempt.create({
    student: req.user._id, course: t.course, test: t._id, answers: g.answers,
    score: g.score, maxScore: g.maxScore, percent: g.percent, passed: g.passed, needsReview: g.needsReview,
    status: g.needsReview ? 'submitted' : 'submitted',
    durationTakenSec: Number(req.body.durationTakenSec) || 0,
  });
  ok(res, { attemptId: attempt._id, score: g.score, maxScore: g.maxScore, percent: Math.round(g.percent), passed: g.passed, needsReview: g.needsReview }, 'Submitted', 201);
});

// GET /api/tests/attempt/:attemptId — full review (your answers vs correct + explanations).
export const getAttempt = asyncHandler(async (req, res) => {
  const a = await TestAttempt.findById(req.params.attemptId).lean();
  if (!a || String(a.student) !== String(req.user._id)) throw ApiError.notFound('Attempt not found.');
  const t = await Test.findById(a.test).lean();
  if (!t) throw ApiError.notFound('Test not found.');
  const ansByQ = Object.fromEntries(a.answers.map((x) => [String(x.question), x]));
  const questions = (t.questions || []).sort((x, y) => x.order - y.order).map((q) => {
    const mine = ansByQ[String(q._id)];
    return {
      id: q._id, text: q.text, type: q.type, marks: q.marks, section: q.section || null, explanation: q.explanation,
      options: q.options.map((o) => ({ id: o._id, text: o.text, isCorrect: o.isCorrect })),
      acceptedAnswers: q.acceptedAnswers || [],
      selected: (mine?.selected || []).map(String), text: mine?.text || '',
      correct: mine?.correct || false, awarded: mine?.awarded || 0, needsReview: mine?.needsReview || false, counted: mine?.counted !== false,
    };
  });
  ok(res, { attempt: {
    id: a._id, title: t.title, score: a.score, maxScore: a.maxScore, percent: Math.round(a.percent),
    passed: a.passed, passPercent: t.passPercent, submittedAt: a.submittedAt,
    needsReview: a.needsReview, proctored: a.proctored, flagged: a.proctoring?.flagged || false, sections: t.sections || [], questions,
  } });
});

/* ─────────────────────────  SECURE PROCTORED EXAMS  ───────────────────────── */
import { Upload } from '../models/Upload.js';
import { notifyAdmins } from '../services/notify.js';

const normalizeText = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');

/** Resolve a student's own ready proctor-capture upload id (or null). */
async function proctorUpload(userId, id) {
  if (!id) return null;
  const u = await Upload.findOne({ _id: id, owner: userId, purpose: 'proctor-capture', status: 'ready' }).lean();
  return u ? u._id : null;
}

/** Grade each answer individually (raw award per question, no section capping). */
function gradeAnswers(test, submittedAnswers) {
  const neg = test.negativeMarkPerWrong || 0;
  const byQ = Object.fromEntries((submittedAnswers || []).map((a) => [String(a.question), a]));
  return test.questions.map((q) => {
    const sub = byQ[String(q._id)] || {};
    if (q.type === 'paragraph') {
      const answered = String(sub.text || '').trim() !== '';
      return { question: q._id, section: q.section || null, text: String(sub.text || ''), correct: false, awarded: 0, needsReview: answered };
    }
    if (q.type === 'fill_blank') {
      const ans = normalizeText(sub.text);
      const accepted = (q.acceptedAnswers || []).map(normalizeText).filter(Boolean);
      const isCorrect = ans !== '' && accepted.includes(ans);
      const awarded = isCorrect ? (q.marks || 0) : (ans !== '' && neg > 0 ? -neg : 0);
      return { question: q._id, section: q.section || null, text: String(sub.text || ''), correct: isCorrect, awarded };
    }
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => String(o._id)).sort();
    const chosen = (sub.selected || []).map(String).sort();
    const answered = chosen.length > 0;
    const isCorrect = answered && correctIds.length === chosen.length && correctIds.every((id, i) => id === chosen[i]);
    let awarded = 0;
    if (isCorrect) awarded = q.marks || 0;
    else if (answered && neg > 0) awarded = -neg;
    return { question: q._id, section: q.section || null, selected: chosen, correct: isCorrect, awarded };
  });
}

/**
 * Apply section scoring across graded answers. For each section only the best
 * `answerCount` answers count ("choose N of M"); the rest are marked counted:false.
 * Returns final totals and mutates each answer's `counted` flag.
 */
function applyScoring(test, answers) {
  const qById = Object.fromEntries(test.questions.map((q) => [String(q._id), q]));
  const sections = test.sections || [];
  let score = 0, maxScore = 0, needsReview = false;
  const countedIds = new Set();

  for (const sec of sections) {
    const sid = String(sec._id);
    const qIds = test.questions.filter((q) => String(q.section) === sid).map((q) => String(q._id));
    const given = qIds.length;
    const n = sec.answerCount > 0 ? Math.min(sec.answerCount, given) : given;
    maxScore += n * (sec.marksPerQuestion || 0);
    const secAns = answers.filter((a) => qIds.includes(String(a.question)));
    if (secAns.some((a) => a.needsReview)) needsReview = true;
    // best N by awarded (paragraphs pending count as 0 until graded)
    const ranked = secAns.slice().sort((x, y) => (y.awarded || 0) - (x.awarded || 0)).slice(0, n);
    for (const a of ranked) { score += Math.max(0, a.awarded || 0); countedIds.add(String(a.question)); }
  }
  // questions with no section count individually
  for (const q of test.questions.filter((q) => !q.section)) {
    maxScore += q.marks || 0;
    const a = answers.find((x) => String(x.question) === String(q._id));
    if (a) { score += Math.max(0, a.awarded || 0); countedIds.add(String(q._id)); if (a.needsReview) needsReview = true; }
  }
  for (const a of answers) a.counted = countedIds.has(String(a.question));
  score = Math.max(0, score);
  const percent = maxScore ? (score / maxScore) * 100 : 0;
  const passed = !needsReview && percent >= (test.passPercent || 0);
  return { answers, score, maxScore, percent, passed, needsReview };
}

/** Grade a submitted answer set across all question types, with section scoring. */
function gradeAttempt(test, submittedAnswers) {
  return applyScoring(test, gradeAnswers(test, submittedAnswers));
}

// POST /api/tests/:id/start  { idFaceUploadId?, idCardUploadId? } → creates an in-progress attempt
export const startAttempt = asyncHandler(async (req, res) => {
  const t = await Test.findById(req.params.id).lean();
  if (!t || !t.isPublished) throw ApiError.notFound('Test not available.');
  if (!(await inCourse(req.user._id, t.course))) throw ApiError.forbidden('Not enrolled in this course.');
  const allowed = t.isFree || (await can(req.user._id, 'mock_tests', t.course));
  if (!allowed) throw ApiError.forbidden('You need mock-tests access for this test.');
  if (t.attemptsAllowed > 0) {
    const used = await TestAttempt.countDocuments({ student: req.user._id, test: t._id, status: { $ne: 'in_progress' } });
    if (used >= t.attemptsAllowed) throw ApiError.badRequest(`You've used all ${t.attemptsAllowed} attempts.`);
  }
  const proc = t.proctoring || {};
  const idFace = await proctorUpload(req.user._id, req.body.idFaceUploadId);
  const idCard = await proctorUpload(req.user._id, req.body.idCardUploadId);
  if (proc.enabled && proc.idVerification && (!idFace || !idCard)) {
    throw ApiError.badRequest('ID verification photos are required to start this exam.');
  }

  const attempt = await TestAttempt.create({
    student: req.user._id, course: t.course, test: t._id,
    status: 'in_progress', proctored: !!proc.enabled, startedAt: new Date(),
    maxScore: sectionTotal(t),
    proctoring: { idFace, idCard, verifiedAt: idFace ? new Date() : null, violations: [] },
  });

  // Build the take payload (no correct answers).
  let qs = (t.questions || []).slice().sort((a, b) => a.order - b.order);
  if (t.shuffleQuestions) qs = shuffle(qs);
  const questions = qs.map((q) => ({
    id: q._id, text: q.text, type: q.type, marks: q.marks, section: q.section || null,
    options: q.type === 'single' || q.type === 'multiple'
      ? (t.shuffleOptions ? shuffle(q.options) : q.options).map((o) => ({ id: o._id, text: o.text }))
      : [],
  }));
  ok(res, {
    attemptId: attempt._id,
    test: {
      id: t._id, course: t.course, title: t.title, description: t.description,
      durationMin: t.durationMin, passPercent: t.passPercent, totalMarks: sectionTotal(t),
      proctoring: proc, sections: t.sections || [], questions,
    },
  }, 'Attempt started', 201);
});

// POST /api/tests/attempt/:attemptId/event  { type, detail?, screenshotUploadId? }
export const logEvent = asyncHandler(async (req, res) => {
  const a = await TestAttempt.findById(req.params.attemptId);
  if (!a || String(a.student) !== String(req.user._id)) throw ApiError.notFound('Attempt not found.');
  if (a.status !== 'in_progress') throw ApiError.badRequest('This attempt is no longer active.');
  const t = await Test.findById(a.test).select('proctoring title').lean();
  const proc = t?.proctoring || {};
  const shot = await proctorUpload(req.user._id, req.body.screenshotUploadId);
  a.proctoring.violations.push({ type: String(req.body.type || 'unknown'), detail: String(req.body.detail || ''), screenshot: shot });
  const count = a.proctoring.violations.length;
  const max = proc.maxViolations || 3;
  let flagged = a.proctoring.flagged, terminated = false;
  if (count >= max && !a.proctoring.flagged) {
    a.proctoring.flagged = true; flagged = true;
    if (proc.terminateOnMax) { a.status = 'terminated'; a.proctoring.terminatedReason = 'Exceeded violation limit'; terminated = true; }
    notifyAdmins({ type: 'proctor', title: `Exam flagged: ${t?.title || 'Test'}`, body: `${req.user.name} — ${count} violations`, link: '/admin/tests' });
  }
  await a.save();
  ok(res, { count, max, flagged, terminated });
});

// POST /api/tests/attempt/:attemptId/submit  { answers, durationTakenSec }
export const submitAttempt = asyncHandler(async (req, res) => {
  const a = await TestAttempt.findById(req.params.attemptId);
  if (!a || String(a.student) !== String(req.user._id)) throw ApiError.notFound('Attempt not found.');
  if (a.status !== 'in_progress') throw ApiError.badRequest('This attempt has already been submitted.');
  const t = await Test.findById(a.test);
  if (!t) throw ApiError.notFound('Test not found.');

  const g = gradeAttempt(t, req.body.answers);
  a.answers = g.answers; a.score = g.score; a.maxScore = g.maxScore;
  a.percent = g.percent; a.passed = g.passed; a.needsReview = g.needsReview;
  a.durationTakenSec = Number(req.body.durationTakenSec) || 0;
  a.submittedAt = new Date();
  if (a.status === 'in_progress') a.status = a.proctoring?.flagged ? 'flagged' : 'submitted';
  await a.save();
  ok(res, {
    attemptId: a._id, score: a.score, maxScore: a.maxScore, percent: Math.round(a.percent),
    passed: a.passed, needsReview: a.needsReview, flagged: a.proctoring?.flagged || false,
  }, 'Submitted');
});
