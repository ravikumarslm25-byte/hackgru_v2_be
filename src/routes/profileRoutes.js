import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { getProfile, updateProfile, setPhoto, changePassword } from '../controllers/profileController.js';

// Any signed-in role: student, spoc, admin, instructor.
const router = Router();
router.use(protect);
router.route('/').get(getProfile).put(updateProfile);
router.put('/photo', setPhoto);
router.put('/password', changePassword);
export default router;
