import { ApiError } from '../../utils/ApiError.js';
import { Department } from '../../models/org/Department.js';
import { Batch } from '../../models/org/Batch.js';

/**
 * Resolve exactly what one SPOC is allowed to see.
 *
 * Built once per request and passed to collegeRepository. Nothing in the college
 * portal reads data without one of these.
 *
 * THE RULE THIS ENFORCES
 * ----------------------
 * A student is visible to a college only if `user.college` points at it — and
 * `user.college` is set only by a special-link registration. Someone who signed
 * up on the public website and typed "Anna University" into their profile has
 * college = null and can never match. The boundary is the shape of the data,
 * not a filter a future controller might forget.
 */
export async function buildCollegeScope(spoc) {
  if (!spoc || spoc.role !== 'spoc') {
    throw ApiError.forbidden('This area is for college staff.');
  }
  const collegeId = spoc.spocAccess?.college;
  if (!collegeId) {
    // A spoc with no college would otherwise scope to "nothing", which is safe
    // but silently broken. Fail loudly so it gets fixed.
    throw ApiError.forbidden('Your account is not linked to a college yet. Please contact HackGRU support.');
  }

  // Departments: an explicit list, or every department in the college.
  const allowedDeptIds = spoc.spocAccess?.departments?.length
    ? spoc.spocAccess.departments
    : (await Department.find({ college: collegeId, isActive: true }).select('_id').lean()).map((d) => d._id);

  // Batches: an explicit list, or every batch inside the allowed departments.
  // Note the college filter is applied even when explicit batch IDs are given —
  // a stale or hand-edited ID from another college still can't widen the scope.
  const batchFilter = { college: collegeId, department: { $in: allowedDeptIds } };
  if (spoc.spocAccess?.batches?.length) batchFilter._id = { $in: spoc.spocAccess.batches };
  const allowedBatchIds = (await Batch.find(batchFilter).select('_id').lean()).map((b) => b._id);

  const granted = new Set(spoc.spocAccess?.can || []);

  return Object.freeze({
    spocId: spoc._id,
    collegeId,
    departmentIds: allowedDeptIds,
    batchIds: allowedBatchIds,
    can: (permission) => granted.has(permission),
    /** Throw unless the SPOC holds this permission. */
    require(permission) {
      if (!granted.has(permission)) {
        throw ApiError.forbidden(`Your account doesn't have access to this (${permission}). Ask HackGRU to enable it.`);
      }
      return true;
    },
    /** The filter every student query is ANDed with. */
    studentFilter: Object.freeze({
      role: 'student',
      college: collegeId,
      department: { $in: allowedDeptIds },
    }),
  });
}
