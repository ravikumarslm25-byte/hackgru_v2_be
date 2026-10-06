import { requirePermission as rp } from '../../middleware/auth.js';
import { getAccess as batchGetAccess, extend as batchExtend, revoke as batchRevoke } from '../../controllers/admin/batchAccessController.js';
import { preview as bulkPreview, commit as bulkCommit } from '../../controllers/admin/bulkStudentController.js';
import { batchReport } from '../../controllers/admin/reportController.js';
import { Router } from 'express';
import {
  listColleges, createCollege, getCollege, updateCollege, deactivateCollege,
  listDepartments, createDepartment, updateDepartment,
} from '../../controllers/admin/collegeController.js';
import {
  listStudents, getStudent, listBatches, getBatch, listOrders, dashboard,
} from '../../controllers/admin/dataController.js';
import {
  updateStudent, deleteStudent, resetStudentPassword, deleteCollege, setCollegeActive,
  deleteDepartment, updateBatch, deleteBatch,
} from '../../controllers/admin/crudController.js';
import {
  listCourses, getCourse, createCourse, updateCourse, setPublished,
  deleteCourse, setCollegePrice, removeCollegePrice,
} from '../../controllers/admin/courseController.js';
import { listResumes, getResume, resumeAnalytics } from '../../controllers/resumeController.js';
import { markEnrolmentPaid, removeEnrolment } from '../../controllers/admin/enrolmentAdminController.js';
import { listUploads } from '../../controllers/uploadController.js';

const router = Router();
router.get('/dashboard', dashboard);

router.route('/colleges').all(rp('colleges.manage')).get(listColleges).post(createCollege);
router.route('/colleges/:id').all(rp('colleges.manage')).get(getCollege).put(updateCollege).delete(deactivateCollege);
router.delete('/colleges/:id/hard', rp('colleges.manage'), deleteCollege);
router.patch('/colleges/:id/activate', rp('colleges.manage'), setCollegeActive);

router.route('/departments').all(rp('colleges.manage')).get(listDepartments).post(createDepartment);
router.put('/departments/:id', rp('colleges.manage'), updateDepartment);
router.delete('/departments/:id', rp('colleges.manage'), deleteDepartment);

router.get('/students', rp('students.manage'), listStudents);
router.route('/students/:id').all(rp('students.manage')).get(getStudent).put(updateStudent).delete(deleteStudent);
router.post('/students/:id/reset-password', rp('students.manage'), resetStudentPassword);
router.get('/batches', rp('batches.manage'), listBatches);
router.route('/batches/:id').all(rp('batches.manage')).get(getBatch).put(updateBatch).delete(deleteBatch);
router.get('/batches/:id/access', rp('batches.manage'), batchGetAccess);
router.post('/batches/:id/access/extend', rp('batches.manage'), batchExtend);
router.post('/batches/:id/access/revoke', rp('batches.manage'), batchRevoke);
router.post('/batches/:id/students/preview', rp('students.manage'), bulkPreview);
router.post('/batches/:id/students/commit', rp('students.manage'), bulkCommit);
router.get('/batches/:id/report', rp('reports.view'), batchReport);
router.post('/enrolments/:id/mark-paid', rp('billing.manage'), markEnrolmentPaid);
router.delete('/enrolments/:id', rp('students.manage'), removeEnrolment);

// Courses — full CRUD, website visibility, per-college pricing
router.route('/courses').all(rp('courses.manage')).get(listCourses).post(createCourse);
router.route('/courses/:id').all(rp('courses.manage')).get(getCourse).put(updateCourse).delete(deleteCourse);
router.patch('/courses/:id/publish', rp('courses.manage'), setPublished);
router.put('/courses/:id/pricing', rp('courses.manage'), setCollegePrice);
router.delete('/courses/:id/pricing/:collegeId', rp('courses.manage'), removeCollegePrice);
router.get('/orders', rp('billing.manage'), listOrders);

// Resume builder — usage and access
router.get('/resumes/analytics', rp('students.manage'), resumeAnalytics);
router.get('/resumes', rp('students.manage'), listResumes);
router.get('/resumes/:id', rp('students.manage'), getResume);
router.get('/uploads', listUploads);

export default router;
