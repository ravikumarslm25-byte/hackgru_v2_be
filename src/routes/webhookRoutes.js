import { Router } from 'express';
import { handleWebhook } from '../controllers/webhookController.js';

// Public: Razorpay's servers call this, not the browser. Authenticity is proven
// by the HMAC signature, not a JWT.
const router = Router();
router.post('/', handleWebhook);
export default router;
