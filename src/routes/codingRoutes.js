import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listForCourse, getForSolving, run, submit } from '../controllers/codingController.js';
const router = Router();
router.get('/course/:courseId', protect, listForCourse);
router.get('/problem/:id', protect, getForSolving);
router.post('/problem/:id/run', protect, run);
router.post('/problem/:id/submit', protect, submit);
export default router;
