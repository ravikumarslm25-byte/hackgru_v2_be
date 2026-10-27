import { Router } from 'express';
import { getLiveClass, registerForLiveClass, verifyLiveClassPayment } from '../controllers/liveController.js';

/**
 * Public live-class landing pages: /api/live/:slug
 * No auth — these pages are for the general public (lead generation).
 */
const router = Router();
router.get('/:slug', getLiveClass);
router.post('/:slug/register', registerForLiveClass);
router.post('/:slug/verify', verifyLiveClassPayment);
export default router;
