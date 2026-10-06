import { Router } from 'express';
import { requirePermission } from '../../middleware/auth.js';
import { listTickets, ticketMeta, getTicket, replyTicket, updateTicket, bulkUpdateTickets } from '../../controllers/admin/adminTicketController.js';

const router = Router();
router.use(requirePermission('tickets.manage'));
router.get('/', listTickets);
router.get('/meta', ticketMeta);
router.patch('/bulk', bulkUpdateTickets);
router.get('/:id', getTicket);
router.post('/:id/reply', replyTicket);
router.patch('/:id', updateTicket);
export default router;
