import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/ApiResponse.js';
import { Assessment } from '../models/Assessment.js';

// @route POST /api/assessments  (student submits SSAT answers)
export const submitAssessment = asyncHandler(async (req, res) => {
  const { track, scores = [] } = req.body;
  const overall = scores.length
    ? Math.round(scores.reduce((s, x) => s + (x.score || 0), 0) / scores.length)
    : 0;

  // Simple recommendation heuristic: weakest skills first.
  const recommendedPath = [...scores].sort((a, b) => a.score - b.score).slice(0, 3).map((s) => s.skill);

  const assessment = await Assessment.create({
    student: req.user._id, track, scores, overallScore: overall, recommendedPath,
  });
  ok(res, { assessment }, 'Assessment complete', 201);
});

// @route GET /api/assessments/me
export const getMyAssessments = asyncHandler(async (req, res) => {
  const assessments = await Assessment.find({ student: req.user._id }).sort('-createdAt');
  ok(res, { assessments });
});
