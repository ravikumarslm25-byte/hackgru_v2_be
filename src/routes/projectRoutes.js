import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getMine, submit, fileUrl } from '../controllers/projectController.js';

const router = Router();
router.use(protect);
router.get('/course/:courseId', getMine);
router.put('/course/:courseId', submit);
router.get('/file/:uploadId', fileUrl);
export default router;
