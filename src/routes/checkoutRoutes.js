import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { createOrder, verify, myOrders } from '../controllers/checkoutController.js';
const router = Router();
router.post('/order', protect, createOrder);
router.post('/verify', protect, verify);
router.get('/orders', protect, myOrders);
export default router;
