import { Router } from 'express';
import { optionalAuth } from '../middleware/auth.js';
import { listProducts, getProduct } from '../controllers/storeController.js';
const router = Router();
router.get('/products', optionalAuth, listProducts);
router.get('/products/:slug', optionalAuth, getProduct);
export default router;
