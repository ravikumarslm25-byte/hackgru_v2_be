import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { myCertificates, render, verify } from '../controllers/certificateController.js';

const router = Router();
router.get('/verify/:code', verify);         // public
router.get('/me', protect, myCertificates);
router.get('/:id/render', protect, render);
export default router;
