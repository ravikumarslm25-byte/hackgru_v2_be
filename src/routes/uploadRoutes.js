import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { uploadConfig, presign, confirm, downloadUrl } from '../controllers/uploadController.js';

const router = Router();
router.use(protect);   // nothing here is public — the bucket is private

router.get('/config', uploadConfig);
router.post('/presign', presign);
router.post('/:id/confirm', confirm);
router.get('/:id/url', downloadUrl);
export default router;
