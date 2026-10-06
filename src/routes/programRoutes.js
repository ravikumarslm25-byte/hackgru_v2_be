import { Router } from 'express';
import {
  getPrograms, getProgram, createProgram, updateProgram, deleteProgram,
} from '../controllers/programController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();
router.get('/', getPrograms);
router.get('/:slug', getProgram);
router.post('/', protect, authorize('admin'), createProgram);
router.put('/:id', protect, authorize('admin'), updateProgram);
router.delete('/:id', protect, authorize('admin'), deleteProgram);
export default router;
