import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Problem } from '../models/Problem.js';
import { CodeSubmission } from '../models/CodeSubmission.js';
import { Enrollment } from '../models/Enrollment.js';
import { can } from '../services/access/entitlements.js';
import { runOnJudge0, LANGUAGES } from '../services/judge0/index.js';

async function inCourse(studentId, courseId) {
  if (await can(studentId, 'live_cohort', courseId)) return true;
  return Boolean(await Enrollment.findOne({ student: studentId, course: courseId }).lean());
}
const totalPoints = (tcs) => (tcs || []).reduce((n, t) => n + (t.points || 0), 0);

// GET /api/coding/course/:courseId
export const listForCourse = asyncHandler(async (req, res) => {
  const { courseId } = req.params;
  const hasAccess = await can(req.user._id, 'learning', courseId);
  const problems = await Problem.find({ course: courseId, isPublished: true }).sort('order -createdAt').lean();
  const subs = await CodeSubmission.find({ student: req.user._id, course: courseId }).lean();
  const byProblem = {};
  for (const su of subs) (byProblem[su.problem] ||= []).push(su);
  const items = problems.map((p) => {
    const mine = byProblem[p._id] || [];
    const best = mine.reduce((b, s) => (s.pointsEarned > (b?.pointsEarned ?? -1) ? s : b), null);
    const solved = mine.some((s) => s.verdict === 'accepted');
    return {
      id: p._id, title: p.title, difficulty: p.difficulty, totalPoints: totalPoints(p.testCases),
      isFree: p.isFree, locked: !(p.isFree || hasAccess), solved,
      best: best ? { verdict: best.verdict, pointsEarned: best.pointsEarned, totalPoints: best.totalPoints } : null,
    };
  });
  ok(res, { hasAccess, problems: items });
});

async function loadGated(req) {
  const p = await Problem.findById(req.params.id).lean();
  if (!p || !p.isPublished) throw ApiError.notFound('Problem not available.');
  if (!(await inCourse(req.user._id, p.course))) throw ApiError.forbidden('Not enrolled in this course.');
  if (!(p.isFree || (await can(req.user._id, 'learning', p.course)))) throw ApiError.forbidden('You need learning access for this problem.');
  return p;
}

// GET /api/coding/problem/:id — statement + SAMPLE cases only (never hidden cases).
export const getForSolving = asyncHandler(async (req, res) => {
  const p = await loadGated(req);
  const samples = (p.testCases || []).filter((t) => t.isSample).map((t) => ({ input: t.input, expectedOutput: t.expectedOutput }));

  // Restore the student's own work: latest source per language, plus their best result.
  const subs = await CodeSubmission.find({ student: req.user._id, problem: p._id }).sort('-createdAt').lean();
  const lastByLang = {};
  for (const s of subs) if (s.language && !(s.language in lastByLang)) lastByLang[s.language] = s.source;
  const best = subs.reduce((b, s) => (s.pointsEarned > (b?.pointsEarned ?? -1) ? s : b), null);

  ok(res, { problem: {
    id: p._id, course: p.course, title: p.title, statement: p.statement, difficulty: p.difficulty,
    constraints: p.constraints, languages: (p.languages || []).filter((l) => LANGUAGES[l]),
    starterCode: p.starterCode || {}, samples, totalPoints: totalPoints(p.testCases),
    lastByLang, lastLanguage: subs[0]?.language || null,
    solved: subs.some((s) => s.verdict === 'accepted'),
    best: best ? { verdict: best.verdict, pointsEarned: best.pointsEarned, totalPoints: best.totalPoints } : null,
  } });
});

// run a source against a set of cases, short-circuiting on compile error
async function runCases(language, source, cases) {
  const out = [];
  for (let i = 0; i < cases.length; i++) {
    const r = await runOnJudge0({ language, source, stdin: cases[i].input, expectedOutput: cases[i].expectedOutput });
    out.push({ i, r });
    if (r.statusId === 6) break;   // compilation error — no point running further
  }
  return out;
}

// POST /api/coding/problem/:id/run  { language, source } — SAMPLE cases only, full detail.
export const run = asyncHandler(async (req, res) => {
  const p = await loadGated(req);
  const { language, source } = req.body;
  if (!language || !source?.trim()) throw ApiError.badRequest('Choose a language and write some code.');
  if (!(p.languages || []).includes(language)) throw ApiError.badRequest('That language is not allowed for this problem.');
  const samples = (p.testCases || []).filter((t) => t.isSample);
  if (samples.length === 0) throw ApiError.badRequest('This problem has no sample tests to run.');

  const results = await runCases(language, source, samples);
  const compileError = results.find((x) => x.r.statusId === 6);
  const cases = results.map(({ i, r }) => ({
    input: samples[i].input, expectedOutput: samples[i].expectedOutput,
    stdout: r.stdout, passed: r.passed, statusText: r.statusText, stderr: r.stderr,
  }));
  ok(res, { compileOutput: compileError?.r.compileOutput || '', cases });
});

// POST /api/coding/problem/:id/submit  { language, source } — ALL cases, records a submission.
export const submit = asyncHandler(async (req, res) => {
  const p = await loadGated(req);
  const { language, source } = req.body;
  if (!language || !source?.trim()) throw ApiError.badRequest('Choose a language and write some code.');
  if (!(p.languages || []).includes(language)) throw ApiError.badRequest('That language is not allowed for this problem.');
  const cases = p.testCases || [];
  if (cases.length === 0) throw ApiError.badRequest('This problem has no test cases.');

  const results = await runCases(language, source, cases);
  const compileError = results.find((x) => x.r.statusId === 6);

  let passedCount = 0, pointsEarned = 0;
  const perCase = cases.map((c, idx) => {
    const found = results.find((x) => x.i === idx);
    const passed = Boolean(found?.r.passed);
    if (passed) { passedCount++; pointsEarned += c.points || 0; }
    return { index: idx, passed, points: passed ? (c.points || 0) : 0 };
  });
  const total = cases.length;
  const totalPts = totalPoints(cases);
  const verdict = compileError ? 'error' : (passedCount === total ? 'accepted' : 'wrong');

  await CodeSubmission.create({
    student: req.user._id, course: p.course, problem: p._id, language, source,
    verdict, passedCount, totalCount: total, pointsEarned, totalPoints: totalPts, results: perCase,
  });

  // Reveal detail only for sample cases; hidden cases show pass/fail without input/expected.
  const caseView = cases.map((c, idx) => ({
    index: idx, isSample: c.isSample, passed: perCase[idx].passed,
    ...(c.isSample ? { input: c.input, expectedOutput: c.expectedOutput } : {}),
  }));

  ok(res, {
    verdict, passedCount, totalCount: total, pointsEarned, totalPoints: totalPts,
    compileOutput: compileError?.r.compileOutput || '', cases: caseView,
  }, 'Submitted', 201);
});
