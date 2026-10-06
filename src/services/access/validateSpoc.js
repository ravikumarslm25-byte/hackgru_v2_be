import { ApiError } from '../../utils/ApiError.js';
import { Department } from '../../models/org/Department.js';

/**
 * Every department a SPOC is granted must belong to their own college.
 *
 * buildCollegeScope re-filters by college anyway, so a foreign department ID
 * can't actually widen anyone's scope — it would just silently resolve to
 * nothing. This exists so an admin gets a clear error instead of creating a
 * SPOC whose portal is mysteriously empty.
 *
 * Extracted into its own function on purpose: it's called from two places
 * (create and update), and a test that greps the controller source can't tell
 * whether BOTH call sites still do it. This one can be tested directly.
 */
export async function assertDepartmentsBelongTo(collegeId, departmentIds = []) {
  if (!departmentIds.length) return true;   // empty = all departments in the college

  const valid = await Department.countDocuments({
    _id: { $in: departmentIds },
    college: collegeId,
  });

  if (valid !== departmentIds.length) {
    throw ApiError.badRequest(
      'One or more of those departments do not belong to that college.'
    );
  }
  return true;
}
