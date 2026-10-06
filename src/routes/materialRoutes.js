import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { studentList, studentDownload } from '../controllers/materialController.js';

const router = Router();
router.use(protect);
router.get('/course/:courseId', studentList);
router.get('/:id/download', studentDownload);
export default router;
