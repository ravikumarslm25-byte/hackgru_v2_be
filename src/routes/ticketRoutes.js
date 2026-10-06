import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { createTicket, myTickets, getMyTicket, replyMyTicket, closeMyTicket, reopenMyTicket } from '../controllers/ticketController.js';

const router = Router();
router.use(protect, authorize('student'));
router.route('/').get(myTickets).post(createTicket);
router.get('/:id', getMyTicket);
router.post('/:id/reply', replyMyTicket);
router.post('/:id/close', closeMyTicket);
router.post('/:id/reopen', reopenMyTicket);
export default router;
