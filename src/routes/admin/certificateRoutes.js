import { Router } from 'express';
import {
  listTemplates, createTemplate, updateTemplate, deleteTemplate, templateAssets,
  issue, adminList, revoke,
} from '../../controllers/certificateController.js';

const router = Router();
// templates
router.get('/templates', listTemplates);
router.post('/templates', createTemplate);
router.get('/templates/:id/assets', templateAssets);
router.patch('/templates/:id', updateTemplate);
router.delete('/templates/:id', deleteTemplate);
// issued certificates
router.get('/', adminList);
router.post('/', issue);
router.delete('/:id', revoke);
export default router;
