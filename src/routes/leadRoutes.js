import { Router } from 'express';
import { createLead, getLeads, updateLead } from '../controllers/leadController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();
router.post('/', createLead);
router.get('/', protect, authorize('admin'), getLeads);
router.patch('/:id', protect, authorize('admin'), updateLead);
export default router;
