import { Router } from 'express';
import {
  permissionCatalogue, listSpocs, createSpoc, updateSpoc, resetSpocPassword,
  deleteSpoc, assignableBatches,
} from '../../controllers/admin/spocController.js';

const router = Router();
router.get('/permissions', permissionCatalogue);
router.get('/assignable', assignableBatches);
router.route('/').get(listSpocs).post(createSpoc);
router.route('/:id').patch(updateSpoc).delete(deleteSpoc);
router.post('/:id/reset-password', resetSpocPassword);
export default router;
