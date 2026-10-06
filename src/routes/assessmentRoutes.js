import { Router } from 'express';
import { submitAssessment, getMyAssessments } from '../controllers/assessmentController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect);
router.post('/', submitAssessment);
router.get('/me', getMyAssessments);
export default router;
