import { Router } from 'express';
import { list, create, markPaid, cancel, remove } from '../../controllers/admin/invoiceController.js';
const router = Router();
router.get('/', list);
router.post('/', create);
router.patch('/:id/paid', markPaid);
router.patch('/:id/cancel', cancel);
router.delete('/:id', remove);
export default router;
