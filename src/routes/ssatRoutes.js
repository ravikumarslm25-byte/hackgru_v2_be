import { Router } from 'express';
import {
  getConfig, getActiveSession, startSession, abandonSession, getNextItem,
  submitAnswer, discoveryDialogue, submitSession, getMyResults, getResult,
} from '../controllers/ssatController.js';
import { protect } from '../middleware/auth.js';

const router = Router();
router.get('/config', getConfig);

router.use(protect);
router.get('/session', getActiveSession);
router.post('/session', startSession);
router.delete('/session/:id', abandonSession);
router.get('/session/:id/next', getNextItem);
router.post('/session/:id/answer', submitAnswer);
router.post('/session/:id/dialogue', discoveryDialogue);
router.post('/session/:id/submit', submitSession);
router.get('/results/me', getMyResults);
router.get('/results/:id', getResult);

export default router;
