import { Router } from 'express';
import { getTestimonials } from '../controllers/testimonialController.js';

const router = Router();
router.get('/', getTestimonials);
export default router;
