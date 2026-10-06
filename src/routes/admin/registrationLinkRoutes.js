import { Router } from 'express';
import {
  createLink, listLinks, getLink, updateLink, closeLink,
} from '../../controllers/admin/registrationLinkController.js';

const router = Router();
router.post('/', createLink);
router.get('/', listLinks);
router.get('/:id', getLink);
router.patch('/:id', updateLink);
router.delete('/:id', closeLink);
export default router;
