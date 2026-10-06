import { Batch } from '../../models/org/Batch.js';
import { Course } from '../../models/Course.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Entitlement } from '../../models/Entitlement.js';
import { RegistrationLink } from '../../models/org/RegistrationLink.js';
import { grantEntitlement, courseIncludes } from '../access/entitlements.js';

const KINDS = ['recordings', 'learning', 'mock_tests', 'live_cohort'];
const id = (x) => (x && x._id ? x._id : x);

async function includedKinds(courseId) {
  const course = await Course.findById(courseId).select('included').lean();
  return KINDS.filter((k) => courseIncludes(course, k));
}

/**
 * Grant a student the free/sponsored access carried by their registration link.
 * Called at registration time when link.freeAccess is on. Marks the enrolment
 * sponsored so no "payment pending" prompt shows.
 */
export async function grantStudentAccessForLink(studentId, link) {
  const courseId = id(link.course);
  const batchId = id(link.batch);
  const kinds = await includedKinds(courseId);
  for (const kind of kinds) {
    await grantEntitlement({ student: studentId, kind, course: courseId, batch: batchId,
      source: 'grant', expiresAt: link.accessExpiresAt || null });
  }
  await Enrollment.updateOne({ student: studentId, course: courseId }, { $set: { sponsored: true } });
}

/** Pull batch access — deactivate every granted entitlement and stop new grants. */
export async function revokeBatchAccess(batchId) {
  const res = await Entitlement.updateMany(
    { batch: batchId, source: 'grant', active: true },
    { $set: { active: false, note: 'batch access revoked' } },
  );
  await Batch.updateOne({ _id: batchId }, { $set: { accessGranted: false, accessExpiresAt: null } });
  await RegistrationLink.updateMany({ batch: batchId }, { $set: { freeAccess: false } });
  await Enrollment.updateMany({ batch: batchId, sponsored: true }, { $set: { sponsored: false } });
  return { revoked: res.modifiedCount || 0 };
}

/** Change the expiry for the whole batch's granted access (and future registrants). */
export async function extendBatchAccess(batchId, newExpiry) {
  const expiresAt = newExpiry ? new Date(newExpiry) : null;
  await Entitlement.updateMany({ batch: batchId, source: 'grant', active: true }, { $set: { expiresAt } });
  await Batch.updateOne({ _id: batchId }, { $set: { accessExpiresAt: expiresAt } });
  await RegistrationLink.updateMany({ batch: batchId, freeAccess: true }, { $set: { accessExpiresAt: expiresAt } });
  return { expiresAt };
}

/** Access summary for the batch UI. */
export async function batchAccessStatus(batchId) {
  const batch = await Batch.findById(batchId).select('accessGranted accessExpiresAt course').lean();
  if (!batch) return null;
  const link = await RegistrationLink.findOne({ batch: batchId }).select('freeAccess accessExpiresAt').lean();
  const enrolled = await Enrollment.countDocuments({ batch: batchId });
  const withAccess = (await Entitlement.find({ batch: batchId, source: 'grant', active: true }).distinct('student')).length;
  const kinds = await includedKinds(batch.course);
  const granted = Boolean(link?.freeAccess) || withAccess > 0;
  return {
    accessGranted: granted, freeAccess: Boolean(link?.freeAccess),
    accessExpiresAt: batch.accessExpiresAt || link?.accessExpiresAt || null,
    enrolled, withAccess, kinds,
  };
}
