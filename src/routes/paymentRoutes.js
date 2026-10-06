import { Router } from 'express';
import { getPaymentConfig, createOrder, verifyPayment, getMyOrders } from '../controllers/paymentController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.get('/config', getPaymentConfig);
router.post('/order', protect, createOrder);
router.post('/verify', protect, verifyPayment);
router.get('/me', protect, getMyOrders);
export default router;
