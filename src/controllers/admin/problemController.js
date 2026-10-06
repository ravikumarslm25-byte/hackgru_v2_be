import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Problem } from '../../models/Problem.js';
import { Course } from '../../models/Course.js';
import { LANGUAGES, isJudge0Enabled, runOnJudge0 } from '../../services/judge0/index.js';

const totalPoints = (tcs) => (tcs || []).reduce((n, t) => n + (t.points || 0), 0);
const keepId = (x) => (x && mongoose.isValidObjectId(x.id) ? x.id : undefined);

const summary = (p) => ({
  id: p._id, course: p.course?._id || p.course, courseTitle: p.course?.title || '',
  title: p.title, difficulty: p.difficulty, testCount: p.testCases?.length || 0,
  totalPoints: totalPoints(p.testCases), isPublished: p.isPublished, updatedAt: p.updatedAt,
});

export const languages = asyncHandler(async (_req, res) =>
  ok(res, { languages: Object.entries(LANGUAGES).map(([k, v]) => ({ key: k, label: v.label })), enabled: isJudge0Enabled() }));

export const list = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.course) q.course = req.query.course;
  const problems = await Problem.find(q).populate('course', 'title').sort('-updatedAt');
  ok(res, { problems: problems.map(summary) });
});

export const getOne = asyncHandler(async (req, res) => {
  const p = await Problem.findById(req.params.id).lean();
  if (!p) throw ApiError.notFound('Problem not found.');
  ok(res, { problem: { ...p, id: p._id, starterCode: p.starterCode || {}, totalPoints: totalPoints(p.testCases) } });
});

export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.title || !b.course) throw ApiError.badRequest('Title and course are required.');
  if (!(await Course.exists({ _id: b.course }))) throw ApiError.notFound('Course not found.');
  const p = await Problem.create({ course: b.course, title: b.title, difficulty: b.difficulty || 'easy',
    languages: b.languages?.length ? b.languages : Object.keys(LANGUAGES) });
  ok(res, { problem: summary(p) }, 'Problem created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const p = await Problem.findById(req.params.id);
  if (!p) throw ApiError.notFound('Problem not found.');
  const b = req.body;
  for (const f of ['title', 'statement', 'difficulty', 'constraints', 'isFree', 'isPublished']) if (b[f] !== undefined) p[f] = b[f];
  if (Array.isArray(b.languages)) p.languages = b.languages;
  if (b.starterCode && typeof b.starterCode === 'object') p.starterCode = b.starterCode;
  if (Array.isArray(b.testCases)) {
    p.testCases = b.testCases.map((t) => ({
      ...(keepId(t) ? { _id: keepId(t) } : {}),
      input: t.input || '', expectedOutput: t.expectedOutput || '',
      isSample: !!t.isSample, points: Number(t.points) || 1,
    }));
  }
  await p.save();
  await syncCourseFlag(p.course);
  ok(res, { problem: summary(p) }, 'Problem saved');
});

export const setPublished = asyncHandler(async (req, res) => {
  const p = await Problem.findById(req.params.id);
  if (!p) throw ApiError.notFound('Problem not found.');
  if (req.body.isPublished && (p.testCases?.length || 0) === 0)
    throw ApiError.badRequest('Add at least one test case before publishing.');
  p.isPublished = !!req.body.isPublished; await p.save();
  await syncCourseFlag(p.course);
  ok(res, { problem: summary(p) }, p.isPublished ? 'Published' : 'Unpublished');
});

export const remove = asyncHandler(async (req, res) => {
  const p = await Problem.findByIdAndDelete(req.params.id);
  if (!p) throw ApiError.notFound('Problem not found.');
  ok(res, { deleted: true }, 'Problem removed');
});

async function syncCourseFlag(courseId) {
  const has = await Problem.exists({ course: courseId, isPublished: true });
  await Course.updateOne({ _id: courseId }, { $set: { codingAvailable: Boolean(has) } });
}

// POST /api/admin/problems/run  { language, source, stdin }  — quick test run (admin).
export const runCode = asyncHandler(async (req, res) => {
  const { language, source, stdin } = req.body;
  if (!language || !source) throw ApiError.badRequest('language and source are required.');
  const result = await runOnJudge0({ language, source, stdin: stdin || '' });
  ok(res, { result });
});
