import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getCart, addToCart, removeFromCart, clearCart } from '../controllers/cartController.js';
const router = Router();
router.get('/', protect, getCart);
router.post('/', protect, addToCart);
router.delete('/:productId', protect, removeFromCart);
router.delete('/', protect, clearCart);
export default router;
