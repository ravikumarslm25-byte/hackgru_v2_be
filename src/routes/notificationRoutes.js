import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import {
  listNotifications, unreadCount, markRead, markAllRead, clearAll,
} from '../controllers/notificationController.js';

const router = Router();
router.use(protect);
router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.patch('/:id/read', markRead);
router.post('/read-all', markAllRead);
router.delete('/', clearAll);
export default router;
