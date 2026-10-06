import { Router } from 'express';
import { getMyEnrollments, enroll, updateProgress } from '../controllers/enrollmentController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.use(protect); // all enrollment routes require auth
router.get('/me', getMyEnrollments);
router.post('/', enroll);
router.patch('/:id/progress', updateProgress);
export default router;
