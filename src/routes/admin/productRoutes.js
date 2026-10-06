import { Router } from 'express';
import { list, create, update, remove, setPublished } from '../../controllers/admin/productController.js';

const router = Router();
router.get('/', list);
router.post('/', create);
router.patch('/:id/publish', setPublished);
router.patch('/:id', update);
router.delete('/:id', remove);
export default router;
