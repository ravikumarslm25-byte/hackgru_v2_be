import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { revokeBatchAccess, extendBatchAccess, batchAccessStatus } from '../../services/org/batchAccess.js';

// GET /api/admin/batches/:id/access
export const getAccess = asyncHandler(async (req, res) => {
  const status = await batchAccessStatus(req.params.id);
  if (!status) throw ApiError.notFound('Batch not found.');
  ok(res, status);
});

// POST /api/admin/batches/:id/access/extend  { expiresAt }
export const extend = asyncHandler(async (req, res) => {
  await extendBatchAccess(req.params.id, req.body.expiresAt || null);
  const status = await batchAccessStatus(req.params.id);
  ok(res, status, 'Access expiry updated');
});

// POST /api/admin/batches/:id/access/revoke
export const revoke = asyncHandler(async (req, res) => {
  const result = await revokeBatchAccess(req.params.id);
  const status = await batchAccessStatus(req.params.id);
  ok(res, { ...status, ...result }, 'Access revoked');
});
