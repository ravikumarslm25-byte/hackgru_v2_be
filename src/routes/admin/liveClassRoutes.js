import { Router } from 'express';
import {
  listClasses, createClass, getClass, updateClass, deleteClass,
  addSlot, updateSlot, deleteSlot,
  listRegistrations, markRegistrationPaid, deleteRegistration,
} from '../../controllers/admin/liveClassAdminController.js';

/**
 * Admin management for live classes. Mounted under /api/admin/live-classes
 * (auth + permission applied by the admin router).
 */
const router = Router();

// Registrations by id (declared before :id params that could shadow them)
router.post('/registrations/:regId/mark-paid', markRegistrationPaid);
router.delete('/registrations/:regId', deleteRegistration);

router.get('/', listClasses);
router.post('/', createClass);
router.get('/:id', getClass);
router.patch('/:id', updateClass);
router.delete('/:id', deleteClass);

router.post('/:id/slots', addSlot);
router.patch('/:id/slots/:slotId', updateSlot);
router.delete('/:id/slots/:slotId', deleteSlot);

router.get('/:id/registrations', listRegistrations);

export default router;
