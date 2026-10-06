import { Router } from 'express';
import { listCourses, getCurriculum, saveCurriculum } from '../../controllers/admin/recordingController.js';
const router = Router();
router.get('/', listCourses);
router.get('/:courseId', getCurriculum);
router.put('/:courseId', saveCurriculum);
export default router;
