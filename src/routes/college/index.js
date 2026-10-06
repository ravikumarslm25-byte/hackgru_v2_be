import { Router } from 'express';
import { protect, authorize } from '../../middleware/auth.js';
import { me, dashboard, students, student, batches, batch } from '../../controllers/college/portalController.js';

// Everything under /api/college is SPOC-only, applied once here so no
// individual route can forget it. buildCollegeScope re-checks the role and
// resolves what this particular SPOC may see.
const router = Router();
router.use(protect, authorize('spoc'));

router.get('/me', me);
router.get('/dashboard', dashboard);
router.get('/students', students);
router.get('/students/:id', student);
router.get('/batches', batches);
router.get('/batches/:id', batch);

export default router;
