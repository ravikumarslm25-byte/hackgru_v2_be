import { Router } from 'express';
import {
  register, login, getMe, updateMe,
  verifyEmail, resendOtp, forgotPassword, resetPassword,
} from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
export default router;
