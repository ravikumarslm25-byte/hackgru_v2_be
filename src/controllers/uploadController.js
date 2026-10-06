import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Upload } from '../models/Upload.js';
import { User } from '../models/User.js';
import { isStorageEnabled } from '../config/s3.js';
import { presignUpload, confirmUpload, signedDownload, PURPOSES } from '../services/storage/index.js';
import { buildCollegeScope } from '../services/access/collegeScope.js';
import { collegeRepository } from '../services/access/collegeRepository.js';

// @route GET /api/uploads/config
export const uploadConfig = asyncHandler(async (req, res) => {
  ok(res, {
    enabled: isStorageEnabled(),
    purposes: Object.fromEntries(
      Object.entries(PURPOSES)
        .filter(([, p]) => p.roles.includes(req.user.role))
        .map(([k, p]) => [k, { label: p.label, accept: p.accept, maxBytes: p.maxBytes }])
    ),
  });
});

/**
 * @route POST /api/uploads/presign
 * Body: { purpose, filename, contentType, size }
 *
 * Note what is NOT in that body: a key, a path, or a folder. The caller says
 * what kind of thing they're uploading; the server decides where it goes, from
 * their authenticated identity.
 */
export const presign = asyncHandler(async (req, res) => {
  const { purpose, filename, contentType, size } = req.body;
  if (!purpose || !contentType || !size) {
    throw ApiError.badRequest('purpose, contentType and size are required.');
  }
  ok(res, await presignUpload({ user: req.user, purpose, filename, contentType, size }));
});

// @route POST /api/uploads/:id/confirm
export const confirm = asyncHandler(async (req, res) => {
  const record = await confirmUpload({ user: req.user, uploadId: req.params.id });
  ok(res, {
    upload: {
      id: record._id, purpose: record.purpose, originalName: record.originalName,
      contentType: record.contentType, size: record.size, uploadedAt: record.uploadedAt,
    },
  }, 'Uploaded');
});

/**
 * Can this user read this file?
 *
 * The whole point of a private bucket is that this function is the only door.
 * Get it wrong and every project report on the platform is one guessed id away.
 *
 *   student — their own files, nothing else
 *   spoc    — files belonging to students inside their college scope, and only
 *             if they hold the matching permission. Goes through
 *             collegeRepository.owns(), the same boundary as everything else.
 *   admin   — everything
 */
async function canRead(user, record) {
  if (user.role === 'admin') return true;
  if (String(record.owner) === String(user._id)) return true;

  // Ticket attachments: readable by the ticket's student and by any staff who
  // can manage tickets — so both sides of a conversation see each other's files.
  if (record.purpose === 'ticket-attachment') {
    const { Ticket } = await import('../models/Ticket.js');
    const ticket = await Ticket.findOne({ 'messages.attachments.upload': record._id }).select('student').lean();
    if (ticket) {
      if (String(ticket.student) === String(user._id)) return true;
      if (user.role === 'staff' && (user._perms || []).includes('tickets.manage')) return true;
    }
    return false;
  }

  if (user.role === 'spoc') {
    const scope = await buildCollegeScope(user);
    const repo = collegeRepository(scope);
    if (!(await repo.owns(record.owner))) return false;

    // Being in scope isn't enough — the permission has to match the file.
    if (record.purpose === 'project-report') return scope.can('reports:view');
    if (record.purpose === 'student-photo') return scope.can('students:view');
    return false;
  }

  if (user.role === 'instructor' && record.purpose === 'project-report') return true;
  return false;
}

/**
 * @route GET /api/uploads/:id/url
 * Returns a 5-minute presigned link rather than streaming the file — the bytes
 * never pass through this server.
 */
export const downloadUrl = asyncHandler(async (req, res) => {
  const record = await Upload.findById(req.params.id);
  // Same answer for "no such file" and "not yours" — a different one confirms
  // the file exists, which is itself a leak.
  if (!record || record.status !== 'ready') throw ApiError.notFound('File not found.');
  if (!(await canRead(req.user, record))) throw ApiError.notFound('File not found.');

  const url = await signedDownload(record, { inline: req.query.inline === '1' });
  ok(res, {
    url, expiresIn: 300,
    name: record.originalName, contentType: record.contentType, size: record.size,
  });
});

// @route GET /api/admin/uploads — what's actually in the bucket
export const listUploads = asyncHandler(async (req, res) => {
  const { purpose, status = 'ready', page = 1, limit = 25 } = req.query;
  const filter = {};
  if (purpose) filter.purpose = purpose;
  if (status) filter.status = status;

  const [rows, total, byPurpose] = await Promise.all([
    Upload.find(filter).populate('owner', 'name email registerNumber')
      .sort('-createdAt').skip((page - 1) * limit).limit(Number(limit)).lean(),
    Upload.countDocuments(filter),
    Upload.aggregate([
      { $match: { status: 'ready' } },
      { $group: { _id: '$purpose', n: { $sum: 1 }, bytes: { $sum: '$size' } } },
    ]),
  ]);

  // Abandoned presigns: a file picker opened, then nothing. Worth seeing.
  const stale = await Upload.countDocuments({
    status: 'pending', createdAt: { $lt: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  });

  ok(res, {
    uploads: rows, total, page: Number(page), pages: Math.ceil(total / limit),
    byPurpose: byPurpose.map((p) => ({
      purpose: p._id, label: PURPOSES[p._id]?.label || p._id, count: p.n, bytes: p.bytes,
    })),
    totalBytes: byPurpose.reduce((s, p) => s + p.bytes, 0),
    stalePending: stale,
  });
});
