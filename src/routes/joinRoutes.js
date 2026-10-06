import { Router } from 'express';
import { getJoinInfo, checkEmail, join, joinAsExisting, payForJoin } from '../controllers/joinController.js';
import { protect, optionalAuth } from '../middleware/auth.js';

const router = Router();
// Public — a student opening the link has no account yet.
// optionalAuth: the page renders differently for someone already signed in.
router.get('/:token', optionalAuth, getJoinInfo);
router.post('/:token/check', checkEmail);
router.post('/:token', join);
// For someone who already has an account.
router.post('/:token/enrol', protect, joinAsExisting);
// Payment is a SEPARATE step — never part of registering.
router.post('/:token/pay', protect, payForJoin);
export default router;
