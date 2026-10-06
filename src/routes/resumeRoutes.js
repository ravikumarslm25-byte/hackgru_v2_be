import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { listTemplates, getMyResume, saveMyResume, trackDownload } from '../controllers/resumeController.js';

const router = Router();
router.get('/templates', listTemplates);      // public — usable on the marketing site
router.get('/me', protect, getMyResume);
router.put('/me', protect, saveMyResume);
router.post('/me/downloaded', protect, trackDownload);
export default router;
