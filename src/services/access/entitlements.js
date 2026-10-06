import { Entitlement } from '../../models/Entitlement.js';
import { Enrollment } from '../../models/Enrollment.js';
import { Course } from '../../models/Course.js';

/**
 * Does the course bundle this kind into its own price? A course is the umbrella:
 * buying it grants everything ticked in course.included. Legacy courses with no
 * `included` config are treated as "everything included" (the business default),
 * so existing paid students keep full access without a migration.
 */
export function courseIncludes(course, kind) {
  if (!course) return false;
  const inc = course.included;
  if (!inc || typeof inc !== 'object') return true;          // legacy → include all
  if (inc[kind] === undefined) return true;                  // unset key → included
  return Boolean(inc[kind]);
}

/**
 * THE ONE DOOR. Every access gate in the app calls this — the recordings player,
 * the learning module, the test runner, course content.
 *
 * Access is granted if EITHER:
 *   (a) the student holds an explicit active entitlement (product purchase / admin grant), OR
 *   (b) the student has a paid enrolment in the course AND the course bundles this kind
 *       (course.included[kind]) — i.e. they bought the whole course.
 *
 * @returns {Promise<boolean>}
 */
export async function can(studentId, kind, courseId) {
  if (!studentId || !kind || !courseId) return false;

  const ent = await Entitlement.findOne({
    student: studentId,
    kind,
    course: courseId,
    active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).lean();
  if (ent) return true;

  // Whole-course access: a paid enrolment covers every included kind.
  const enr = await Enrollment.findOne({ student: studentId, course: courseId, paid: true }).lean();
  if (enr) {
    const course = await Course.findById(courseId).select('included').lean();
    if (courseIncludes(course, kind)) return true;
  }
  return false;
}

/**
 * Grant an entitlement (idempotent per student+kind+course while active).
 * Used by paid-order fulfilment and by admin "grant access".
 */
export async function grantEntitlement({
  student, kind, course, batch = null, source = 'purchase',
  order = null, product = null, expiresAt = null, grantedBy = null, note = '',
}) {
  if (!student || !kind || !course) throw new Error('grantEntitlement: student, kind, course required');
  const existing = await Entitlement.findOne({ student, kind, course, active: true });
  if (existing) {
    // Extend expiry if the new grant is longer (or lifetime).
    if (expiresAt === null || (existing.expiresAt && expiresAt > existing.expiresAt)) {
      existing.expiresAt = expiresAt;
      await existing.save();
    }
    return existing;
  }
  return Entitlement.create({ student, kind, course, batch, source, order, product, expiresAt, grantedBy, note });
}

/** Revoke (soft) — admin can pull access. */
export async function revokeEntitlement(entitlementId, byUserId) {
  return Entitlement.findByIdAndUpdate(entitlementId, {
    $set: { active: false, note: `revoked by ${byUserId || 'admin'}` },
  }, { new: true });
}

/** All active entitlement kinds a student holds for a course (for the UI). */
export async function entitlementsForCourse(studentId, courseId) {
  const rows = await Entitlement.find({
    student: studentId, course: courseId, active: true,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  }).select('kind expiresAt').lean();
  const kinds = new Set(rows.map((r) => r.kind));

  // A paid whole-course enrolment implies every included kind.
  const enr = await Enrollment.findOne({ student: studentId, course: courseId, paid: true }).lean();
  if (enr) {
    const course = await Course.findById(courseId).select('included').lean();
    for (const k of ['recordings', 'learning', 'mock_tests', 'live_cohort']) {
      if (courseIncludes(course, k)) kinds.add(k);
    }
  }
  return [...kinds];
}
