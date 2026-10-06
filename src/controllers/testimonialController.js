import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/ApiResponse.js';
import { Testimonial } from '../models/Testimonial.js';

// @route GET /api/testimonials
export const getTestimonials = asyncHandler(async (_req, res) => {
  const testimonials = await Testimonial.find({ isFeatured: true }).sort('-createdAt');
  ok(res, { testimonials });
});
