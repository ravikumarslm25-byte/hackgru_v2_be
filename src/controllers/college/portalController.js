import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { buildCollegeScope } from '../../services/access/collegeScope.js';
import { collegeRepository } from '../../services/access/collegeRepository.js';
import { SPOC_PERMISSIONS } from '../../services/access/permissions.js';

/**
 * The college portal.
 *
 * ⚠️ NOTHING IN THIS FILE MAY IMPORT A MODEL. Every read goes through
 * collegeRepository, which $ands the caller's scope onto the bottom of each
 * query. One `User.find({ role: 'student' })` here would hand a SPOC every
 * student on the platform.
 *
 * There is a test that fails if a model import appears in this directory:
 * src/tests/collegePortal.test.mjs → "ARCHITECTURE".
 */

/** Build the scope + repo for this request. */
const repoFor = async (req) => collegeRepository(await buildCollegeScope(req.user));

// @route GET /api/college/me — who am I and what can I see?
export const me = asyncHandler(async (req, res) => {
  const scope = await buildCollegeScope(req.user);
  const granted = req.user.spocAccess?.can || [];
  ok(res, {
    user: {
      id: req.user._id, name: req.user.name, email: req.user.email,
      designation: req.user.spocAccess?.designation || '',
    },
    college: { id: scope.collegeId },
    access: {
      departments: scope.departmentIds.length,
      batches: scope.batchIds.length,
      // Tell the UI what to render rather than letting it guess and 403.
      can: granted,
      // Explain what each one means, so the portal can be honest about limits.
      catalogue: Object.fromEntries(granted.map((p) => [p, SPOC_PERMISSIONS[p]])),
    },
  });
});

// @route GET /api/college/dashboard
export const dashboard = asyncHandler(async (req, res) => {
  const repo = await repoFor(req);
  const [summary, batches, recent] = await Promise.all([
    repo.summary(),
    repo.batches().catch(() => []),   // batches:view may not be granted
    repo.students({ limit: 5 }),
  ]);
  ok(res, { summary, batches: batches.slice(0, 6), recentStudents: recent.students });
});

// @route GET /api/college/students
export const students = asyncHandler(async (req, res) => {
  const repo = await repoFor(req);
  const { q, department, page = 1, limit = 25 } = req.query;

  const filter = {};
  if (department) filter.department = department;
  if (q) filter.$or = [
    { name: new RegExp(q, 'i') },
    { registerNumber: new RegExp(q, 'i') },
  ];
  // Note: even this $or cannot widen the scope — collegeRepository $ands the
  // college filter beneath it. Verified by the SPREAD TRAP test.

  ok(res, await repo.students({ filter, page: Number(page), limit: Number(limit) }));
});

// @route GET /api/college/students/:id
export const student = asyncHandler(async (req, res) => {
  const repo = await repoFor(req);
  const s = await repo.student(req.params.id);
  // Deliberately the same message whether the student doesn't exist or belongs
  // to another college — otherwise this endpoint confirms who studies where.
  if (!s) throw ApiError.notFound('Student not found in your college.');

  const [progress, payments, ssat] = await Promise.all([
    repo.progressFor(req.params.id).catch(() => null),
    repo.paymentsFor(req.params.id).catch(() => null),
    repo.ssatFor(req.params.id).catch(() => null),
  ]);
  ok(res, { student: s, progress, payments, ssat });
});

// @route GET /api/college/batches
export const batches = asyncHandler(async (req, res) => {
  const repo = await repoFor(req);
  ok(res, { batches: await repo.batches() });
});

// @route GET /api/college/batches/:id — read-only roster
export const batch = asyncHandler(async (req, res) => {
  const repo = await repoFor(req);
  const data = await repo.batchRoster(req.params.id, req.query);
  // Identical whether the batch doesn't exist or belongs to another college.
  // A distinct "that isn't yours" would confirm what other colleges are running.
  if (!data) throw ApiError.notFound('Batch not found in your college.');
  ok(res, data);
});
