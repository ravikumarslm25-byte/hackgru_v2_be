import { Router } from 'express';
import { getCourses, getCourse, createCourse, updateCourse } from '../controllers/courseController.js';
import { protect, authorize, optionalAuth } from '../middleware/auth.js';

const router = Router();
router.get('/', getCourses);
router.get('/:slug', optionalAuth, getCourse);
router.post('/', protect, authorize('admin', 'instructor'), createCourse);
router.put('/:id', protect, authorize('admin', 'instructor'), updateCourse);
export default router;
