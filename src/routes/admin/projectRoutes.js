import { Router } from 'express';
import { adminList, adminFileUrl, adminReview } from '../../controllers/projectController.js';

// Mounted under /api/admin (protected + admin-authorized by parent).
const router = Router();
router.get('/', adminList);
router.get('/file/:uploadId', adminFileUrl);
router.patch('/:id/review', adminReview);
export default router;
