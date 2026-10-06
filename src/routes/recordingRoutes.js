import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getCurriculum, getLessonUrl, saveProgress } from '../controllers/recordingController.js';
const router = Router();
router.get('/:courseId', protect, getCurriculum);
router.get('/:courseId/lesson/:lessonId/url', protect, getLessonUrl);
router.post('/:courseId/progress', protect, saveProgress);
export default router;
