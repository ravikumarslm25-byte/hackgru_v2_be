import { Router } from 'express';
import { requirePermission } from '../../middleware/auth.js';
import { getSettings, updateSettings } from '../../controllers/admin/settingsController.js';
import { listRoles, createRole, updateRole, removeRole } from '../../controllers/admin/roleController.js';
import { listUsers, createUser, updateUser, resetUserPassword, removeUser } from '../../controllers/admin/staffUserController.js';

const router = Router();
router.use(requirePermission('users.manage'));

router.route('/settings').get(getSettings).put(updateSettings);
router.route('/roles').get(listRoles).post(createRole);
router.route('/roles/:id').put(updateRole).delete(removeRole);
router.route('/users').get(listUsers).post(createUser);
router.route('/users/:id').put(updateUser).delete(removeUser);
router.post('/users/:id/reset-password', resetUserPassword);
export default router;
