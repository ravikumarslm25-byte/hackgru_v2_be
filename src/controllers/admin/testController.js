import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Test } from '../../models/Test.js';
import { Course } from '../../models/Course.js';

const totalMarks = (qs) => (qs || []).reduce((n, q) => n + (Number(q.marks) || 0), 0);
const keepId = (x) => (x && mongoose.isValidObjectId(x.id) ? x.id : undefined);

const summary = (t) => ({
  id: t._id, course: t.course?._id || t.course, courseTitle: t.course?.title || '',
  title: t.title, durationMin: t.durationMin, passPercent: t.passPercent,
  questionCount: t.questions?.length || 0, totalMarks: totalMarks(t.questions),
  isFree: t.isFree, isPublished: t.isPublished, updatedAt: t.updatedAt,
});

// GET /api/admin/tests?course=
export const list = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.course) q.course = req.query.course;
  const tests = await Test.find(q).populate('course', 'title').sort('-updatedAt');
  ok(res, { tests: tests.map(summary) });
});

// GET /api/admin/tests/:id — full test with questions (correct answers included; admin only).
export const getOne = asyncHandler(async (req, res) => {
  const t = await Test.findById(req.params.id).lean();
  if (!t) throw ApiError.notFound('Test not found.');
  ok(res, { test: { ...t, id: t._id, totalMarks: totalMarks(t.questions) } });
});

function buildSections(rawSections) {
  const sections = [], map = {};
  (rawSections || []).forEach((sc, i) => {
    const _id = keepId(sc) || new mongoose.Types.ObjectId();
    sections.push({ _id, title: (sc.title || '').trim() || `Section ${i + 1}`,
      marksPerQuestion: Number(sc.marksPerQuestion) || 1, answerCount: Number(sc.answerCount) || 0, order: i });
    if (sc.key != null) map[String(sc.key)] = _id;
    map[String(_id)] = _id;
  });
  const byId = Object.fromEntries(sections.map((x) => [String(x._id), x]));
  return { sections, map, byId };
}

function normalizeQuestions(questions, secMap = {}, secById = {}) {
  return (questions || []).map((q, i) => {
    const type = ['single', 'multiple', 'fill_blank', 'paragraph'].includes(q.type) ? q.type : 'single';
    const ref = q.sectionKey != null ? String(q.sectionKey) : (q.section ? String(q.section) : null);
    const sectionId = ref && secMap[ref] ? secMap[ref] : null;
    const secMarks = sectionId && secById[String(sectionId)] ? secById[String(sectionId)].marksPerQuestion : null;
    const base = {
      text: (q.text || '').trim(), type,
      section: sectionId, marks: secMarks != null ? secMarks : (Number(q.marks) || 1),
      explanation: q.explanation || '', order: i, options: [], acceptedAnswers: [],
    };
    if (type === 'single' || type === 'multiple') {
      base.options = (q.options || []).filter((o) => (o.text || '').trim() !== '')
        .map((o) => ({ ...(keepId(o) ? { _id: keepId(o) } : {}), text: o.text.trim(), isCorrect: !!o.isCorrect }));
    } else if (type === 'fill_blank') {
      base.acceptedAnswers = (q.acceptedAnswers || []).map((a) => String(a).trim()).filter(Boolean);
    }
    return keepId(q) ? { _id: keepId(q), ...base } : base;
  });
}

/** Full-content validation — only enforced when a test is PUBLISHED, not on draft saves. */
function validateForPublish(t) {
  const problems = [];
  const qs = t.questions || [];
  if (qs.length === 0) problems.push('Add at least one question before publishing.');
  qs.forEach((q, i) => {
    const n = i + 1;
    if (!(q.text || '').trim()) problems.push(`Question ${n} has no text.`);
    if (q.type === 'single' || q.type === 'multiple') {
      const opts = (q.options || []).filter((o) => (o.text || '').trim() !== '');
      if (opts.length < 2) problems.push(`Question ${n} needs at least two options.`);
      else if (!opts.some((o) => o.isCorrect)) problems.push(`Question ${n} needs a correct option marked.`);
      else if (q.type === 'single' && opts.filter((o) => o.isCorrect).length > 1) problems.push(`Question ${n} is single-answer but has multiple correct options.`);
    } else if (q.type === 'fill_blank') {
      if ((q.acceptedAnswers || []).filter((a) => String(a).trim()).length === 0) problems.push(`Question ${n} (fill in the blank) needs at least one accepted answer.`);
    }
  });
  return problems;
}
// POST /api/admin/tests// POST /api/admin/tests
export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.title || !b.course) throw ApiError.badRequest('Title and course are required.');
  if (!(await Course.exists({ _id: b.course }))) throw ApiError.notFound('Course not found.');
  const t = await Test.create({
    course: b.course, title: b.title, description: b.description || '',
    durationMin: Number(b.durationMin) || 0, passPercent: Number(b.passPercent) || 40,
    negativeMarkPerWrong: Number(b.negativeMarkPerWrong) || 0,
    shuffleQuestions: !!b.shuffleQuestions, shuffleOptions: !!b.shuffleOptions,
    attemptsAllowed: Number(b.attemptsAllowed) || 0, isFree: !!b.isFree, isPublished: !!b.isPublished,
    proctoring: b.proctoring || {},
    ...(() => { const S = buildSections(b.sections); return { sections: S.sections, questions: normalizeQuestions(b.questions, S.map, S.byId) }; })(),
  });
  ok(res, { test: summary(t) }, 'Test created', 201);
});

// PUT /api/admin/tests/:id — save settings + questions.
export const update = asyncHandler(async (req, res) => {
  const t = await Test.findById(req.params.id);
  if (!t) throw ApiError.notFound('Test not found.');
  const b = req.body;
  const fields = ['title', 'description', 'durationMin', 'passPercent', 'negativeMarkPerWrong',
    'shuffleQuestions', 'shuffleOptions', 'attemptsAllowed', 'isFree', 'isPublished', 'proctoring'];
  for (const f of fields) if (b[f] !== undefined) t[f] = b[f];
  if (b.sections !== undefined || b.questions !== undefined) {
    const S = buildSections(b.sections !== undefined ? b.sections : t.sections);
    if (b.sections !== undefined) t.sections = S.sections;
    if (b.questions !== undefined) t.questions = normalizeQuestions(b.questions, S.map, S.byId);
  }
  if (t.isPublished) {
    const problems = validateForPublish(t);
    if (problems.length) throw ApiError.badRequest(`Can't publish yet: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`);
  }
  await t.save();
  ok(res, { test: summary(t) }, 'Test saved');
});

export const setPublished = asyncHandler(async (req, res) => {
  const t = await Test.findById(req.params.id);
  if (!t) throw ApiError.notFound('Test not found.');
  if (req.body.isPublished) {
    const problems = validateForPublish(t);
    if (problems.length) throw ApiError.badRequest(`Can't publish yet: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`);
  }
  t.isPublished = !!req.body.isPublished;
  await t.save();
  ok(res, { test: summary(t) }, t.isPublished ? 'Published' : 'Unpublished');
});

export const remove = asyncHandler(async (req, res) => {
  const t = await Test.findByIdAndDelete(req.params.id);
  if (!t) throw ApiError.notFound('Test not found.');
  ok(res, { deleted: true }, 'Test removed');
});

/* ─────────────────────────  ATTEMPT REVIEW (proctoring)  ───────────────────────── */
import { TestAttempt } from '../../models/TestAttempt.js';

// GET /api/admin/tests/:id/attempts — list attempts with proctoring summary
export const listAttempts = asyncHandler(async (req, res) => {
  const attempts = await TestAttempt.find({ test: req.params.id })
    .populate('student', 'name email registerNumber').sort('-createdAt').lean();
  const items = attempts.map((a) => ({
    id: a._id,
    student: a.student ? { id: a.student._id, name: a.student.name, email: a.student.email, registerNumber: a.student.registerNumber || '' } : null,
    score: a.score, maxScore: a.maxScore, percent: Math.round(a.percent), passed: a.passed,
    status: a.status, proctored: a.proctored, flagged: a.proctoring?.flagged || false,
    violations: a.proctoring?.violations?.length || 0, needsReview: a.needsReview,
    startedAt: a.startedAt, submittedAt: a.submittedAt, durationTakenSec: a.durationTakenSec,
  }));
  ok(res, { attempts: items });
});

// GET /api/admin/tests/attempt/:attemptId — full report (answers + proctoring). Capture URLs fetched client-side via /uploads/:id/url.
export const getAttemptReport = asyncHandler(async (req, res) => {
  const a = await TestAttempt.findById(req.params.attemptId).populate('student', 'name email registerNumber').lean();
  if (!a) throw ApiError.notFound('Attempt not found.');
  const t = await Test.findById(a.test).lean();
  const ansByQ = Object.fromEntries((a.answers || []).map((x) => [String(x.question), x]));
  const questions = (t?.questions || []).sort((x, y) => x.order - y.order).map((q) => {
    const mine = ansByQ[String(q._id)] || {};
    return {
      id: q._id, text: q.text, type: q.type, marks: q.marks, section: q.section || null,
      options: q.options?.map((o) => ({ id: o._id, text: o.text, isCorrect: o.isCorrect })) || [],
      acceptedAnswers: q.acceptedAnswers || [],
      selected: (mine.selected || []).map(String), text_answer: mine.text || '',
      correct: mine.correct || false, awarded: mine.awarded || 0, needsReview: mine.needsReview || false, counted: mine.counted !== false,
    };
  });
  const p = a.proctoring || {};
  ok(res, { attempt: {
    id: a._id, title: t?.title, student: a.student ? { name: a.student.name, email: a.student.email, registerNumber: a.student.registerNumber || '' } : null,
    score: a.score, maxScore: a.maxScore, percent: Math.round(a.percent), passed: a.passed,
    status: a.status, proctored: a.proctored, needsReview: a.needsReview,
    startedAt: a.startedAt, submittedAt: a.submittedAt, durationTakenSec: a.durationTakenSec,
    sections: t?.sections || [],
    proctoring: {
      idFace: p.idFace || null, idCard: p.idCard || null, verifiedAt: p.verifiedAt || null,
      flagged: p.flagged || false, terminatedReason: p.terminatedReason || '',
      violations: (p.violations || []).map((v) => ({ id: v._id, type: v.type, detail: v.detail, at: v.at, screenshot: v.screenshot || null })),
    },
    questions,
  } });
});

// PATCH /api/admin/tests/attempt/:attemptId/grade  { grades: { [questionId]: awarded } } — grade paragraph answers
export const gradeAttempt = asyncHandler(async (req, res) => {
  const a = await TestAttempt.findById(req.params.attemptId);
  if (!a) throw ApiError.notFound('Attempt not found.');
  const grades = req.body.grades || {};
  a.answers = a.answers.map((ans) => {
    if (Object.prototype.hasOwnProperty.call(grades, String(ans.question))) {
      ans.awarded = Number(grades[String(ans.question)]) || 0;
      ans.needsReview = false;
      ans.correct = ans.awarded > 0;
    }
    return ans;
  });
  const t = await Test.findById(a.test).lean();
  // Re-apply section scoring (best-N per section) after manual grades.
  const secs = t?.sections || [];
  let score = 0, maxScore = 0;
  const countedIds = new Set();
  if (secs.length) {
    for (const sec of secs) {
      const qIds = (t.questions || []).filter((q) => String(q.section) === String(sec._id)).map((q) => String(q._id));
      const given = qIds.length;
      const n = sec.answerCount > 0 ? Math.min(sec.answerCount, given) : given;
      maxScore += n * (sec.marksPerQuestion || 0);
      const secAns = a.answers.filter((x) => qIds.includes(String(x.question)));
      const ranked = secAns.slice().sort((x, y) => (y.awarded || 0) - (x.awarded || 0)).slice(0, n);
      for (const x of ranked) { score += Math.max(0, x.awarded || 0); countedIds.add(String(x.question)); }
    }
    for (const q of (t.questions || []).filter((q) => !q.section)) {
      maxScore += q.marks || 0;
      const x = a.answers.find((y) => String(y.question) === String(q._id));
      if (x) { score += Math.max(0, x.awarded || 0); countedIds.add(String(q._id)); }
    }
    a.answers = a.answers.map((x) => { x.counted = countedIds.has(String(x.question)); return x; });
    a.maxScore = maxScore;
  } else {
    score = a.answers.reduce((n, x) => n + Math.max(0, x.awarded || 0), 0);
  }
  a.score = Math.max(0, score);
  a.percent = a.maxScore ? (a.score / a.maxScore) * 100 : 0;
  a.needsReview = a.answers.some((x) => x.needsReview);
  a.passed = !a.needsReview && a.percent >= (t?.passPercent || 0);
  await a.save();
  ok(res, { score: a.score, percent: Math.round(a.percent), passed: a.passed, needsReview: a.needsReview }, 'Graded');
});
