import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Program } from '../models/Program.js';

// @route GET /api/programs?category=technical
export const getPrograms = asyncHandler(async (req, res) => {
  const filter = { isPublished: true };
  if (req.query.category) filter.category = req.query.category;
  const programs = await Program.find(filter).sort('-createdAt');
  ok(res, { programs });
});

// @route GET /api/programs/:slug
export const getProgram = asyncHandler(async (req, res) => {
  const program = await Program.findOne({ slug: req.params.slug });
  if (!program) throw ApiError.notFound('Program not found');
  ok(res, { program });
});

// @route POST /api/programs   (admin)
export const createProgram = asyncHandler(async (req, res) => {
  const program = await Program.create(req.body);
  ok(res, { program }, 'Program created', 201);
});

// @route PUT /api/programs/:id (admin)
export const updateProgram = asyncHandler(async (req, res) => {
  const program = await Program.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!program) throw ApiError.notFound('Program not found');
  ok(res, { program }, 'Program updated');
});

// @route DELETE /api/programs/:id (admin)
export const deleteProgram = asyncHandler(async (req, res) => {
  const program = await Program.findByIdAndDelete(req.params.id);
  if (!program) throw ApiError.notFound('Program not found');
  ok(res, {}, 'Program deleted');
});
