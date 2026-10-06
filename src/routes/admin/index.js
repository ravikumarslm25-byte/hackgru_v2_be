import { Router } from 'express';
import { protect, authorize, requirePermission as rp } from '../../middleware/auth.js';
import registrationLinkRoutes from './registrationLinkRoutes.js';
import dataRoutes from './dataRoutes.js';
import spocRoutes from './spocRoutes.js';
import materialRoutes from './materialRoutes.js';
import projectRoutes from './projectRoutes.js';
import certificateRoutes from './certificateRoutes.js';
import productRoutes from './productRoutes.js';
import categoryRoutes from './categoryRoutes.js';
import recordingRoutes from './recordingRoutes.js';
import testRoutes from './testRoutes.js';
import problemRoutes from './problemRoutes.js';
import invoiceRoutes from './invoiceRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import ticketRoutes from './ticketRoutes.js';

// Everything under /api/admin is admin-only. Applied once, here, so no
// individual admin route can forget it.
const router = Router();
router.use(protect, authorize('admin', 'staff'));

router.use('/registration-links', rp('batches.manage'), registrationLinkRoutes);
router.use('/spocs', rp('colleges.manage'), spocRoutes);
router.use('/materials', rp('courses.manage'), materialRoutes);
router.use('/projects', rp('students.manage'), projectRoutes);
router.use('/certificates', rp('certificates.manage'), certificateRoutes);
router.use('/products', rp('products.manage'), productRoutes);
router.use('/categories', rp('courses.manage'), categoryRoutes);
router.use('/recordings', rp('courses.manage'), recordingRoutes);
router.use('/tests', rp('courses.manage'), testRoutes);
router.use('/problems', rp('courses.manage'), problemRoutes);
router.use('/invoices', rp('billing.manage'), invoiceRoutes);
router.use('/tickets', ticketRoutes);
router.use('/', settingsRoutes);
router.use('/', dataRoutes);

export default router;
