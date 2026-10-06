import { Router } from 'express';
import { adminList, adminCreate, adminUpdate, adminDelete, adminView } from '../../controllers/materialController.js';

// Mounted under /api/admin (already protected + admin-authorized by the parent).
const router = Router();
router.get('/', adminList);
router.get('/:id/view', adminView);
router.post('/', adminCreate);
router.patch('/:id', adminUpdate);
router.delete('/:id', adminDelete);
export default router;
