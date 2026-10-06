import crypto from 'crypto';
import path from 'path';
import {
  PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getS3, isStorageEnabled } from '../../config/s3.js';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { Upload } from '../../models/Upload.js';

/**
 * File storage on S3, via presigned URLs.
 *
 * Files go BROWSER → S3 directly. They never touch this server, which means no
 * memory pressure, no request-body limits, and it works on a host with an
 * ephemeral filesystem (Render/Railway wipe the disk on every deploy — a local
 * upload folder would lose students' project reports on your next push).
 *
 * ── THE RULE ──────────────────────────────────────────────────────────────
 * THE SERVER CHOOSES THE KEY. NEVER THE CLIENT.
 *
 * If the client passes a key, or any part of one, then a student uploads to
 * `students/<someone-else>/photo/` and overwrites their picture. Or to
 * `../../../projects/x/report.pdf`. The caller says WHAT they're uploading
 * (a purpose); the server decides WHERE it lands, from the authenticated user.
 * There is no code path where a client-supplied string reaches a key.
 * ──────────────────────────────────────────────────────────────────────────
 */

/** What can be uploaded, by whom, and where it goes. */
export const PURPOSES = {
  'student-photo': {
    label: 'Profile photo',
    accept: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 3 * 1024 * 1024,
    roles: ['student', 'spoc', 'admin'],
    // Note the key derives from the AUTHENTICATED user, not from any input.
    key: ({ user, ext }) => `students/${user._id}/photo/${crypto.randomUUID()}${ext}`,
  },
  'project-report': {
    label: 'Project report',
    accept: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
    ],
    maxBytes: 25 * 1024 * 1024,
    roles: ['student'],
    key: ({ user, ext }) => `students/${user._id}/reports/${crypto.randomUUID()}${ext}`,
  },
  'course-material': {
    label: 'Course material',
    accept: [
      'application/pdf', 'application/zip',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png', 'image/jpeg', 'video/mp4',
    ],
    maxBytes: 200 * 1024 * 1024,
    roles: ['admin', 'instructor'],
    key: ({ ext }) => `materials/${crypto.randomUUID()}${ext}`,
  },
  'lesson-video': {
    label: 'Lesson video',
    accept: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'],
    maxBytes: 3 * 1024 * 1024 * 1024,   // 3 GB
    roles: ['admin', 'instructor'],
    key: ({ ext }) => `recordings/${crypto.randomUUID()}${ext}`,
  },
  'product-thumb': {
    label: 'Product thumbnail',
    accept: ['image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 3 * 1024 * 1024,
    roles: ['admin'],
    key: ({ ext }) => `products/${crypto.randomUUID()}${ext}`,
  },
  'cert-asset': {
    label: 'Certificate asset',
    accept: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    roles: ['admin'],
    key: ({ ext }) => `certificates/assets/${crypto.randomUUID()}${ext}`,
  },
  'student-project': {
    label: 'Project submission',
    // Three formats only: PDF report + images. (Video is submitted as a link, not a file.)
    accept: ['application/pdf', 'image/png', 'image/jpeg'],
    maxBytes: 25 * 1024 * 1024,
    roles: ['student'],
    key: ({ user, ext }) => `students/${user._id}/projects/${crypto.randomUUID()}${ext}`,
  },
  'ticket-attachment': {
    label: 'Ticket attachment',
    accept: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    maxBytes: 10 * 1024 * 1024,   // 10 MB
    roles: ['student', 'admin', 'staff'],
    key: ({ user, ext }) => `tickets/${user._id}/${crypto.randomUUID()}${ext}`,
  },
  'payment-proof': {
    label: 'Payment proof',
    accept: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'],
    maxBytes: 10 * 1024 * 1024,
    roles: ['student', 'admin', 'staff'],
    key: ({ user, ext }) => `payment-proof/${user._id}/${crypto.randomUUID()}${ext}`,
  },
  'proctor-capture': {
    label: 'Proctoring capture',
    accept: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    roles: ['student', 'admin'],
    key: ({ user, ext }) => `proctor/${user._id}/${crypto.randomUUID()}${ext}`,
  },
};

/** Extensions we'll put on a key. Anything else gets no extension at all. */
const EXT_FOR = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/svg+xml': '.svg',
  'application/pdf': '.pdf', 'application/zip': '.zip',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
};

/** Keep the original name for display only — never for the key. */
const safeName = (name = '') =>
  path.basename(String(name)).replace(/[^\w.\- ]/g, '').slice(0, 120) || 'file';

/**
 * Step 1 — issue a presigned PUT.
 *
 * Content-Type and Content-Length are baked into the SIGNATURE, so S3 itself
 * rejects a PUT that doesn't match. Without pinning content type, a client
 * declares `image/jpeg`, uploads HTML, and you have stored XSS the moment
 * anything serves it inline.
 */
export async function presignUpload({ user, purpose, filename, contentType, size }) {
  if (!isStorageEnabled()) {
    throw new ApiError(503, 'File uploads are not set up yet. Please contact HackGRU.');
  }

  const spec = PURPOSES[purpose];
  if (!spec) throw ApiError.badRequest('Unknown upload type.');
  if (!spec.roles.includes(user.role)) {
    throw ApiError.forbidden(`Your account can't upload a ${spec.label.toLowerCase()}.`);
  }
  if (!spec.accept.includes(contentType)) {
    throw ApiError.badRequest(
      `${spec.label} must be ${spec.accept.map((t) => EXT_FOR[t] || t).join(', ')}. ` +
      `That file is ${contentType || 'an unknown type'}.`
    );
  }
  const bytes = Number(size);
  if (!bytes || bytes < 1) throw ApiError.badRequest('That file is empty.');
  if (bytes > spec.maxBytes) {
    throw ApiError.badRequest(
      `${spec.label} must be under ${Math.round(spec.maxBytes / 1024 / 1024)}MB. ` +
      `That one is ${(bytes / 1024 / 1024).toFixed(1)}MB.`
    );
  }

  const ext = EXT_FOR[contentType] || '';
  const key = spec.key({ user, ext });   // ← server-side, from the authenticated user

  const record = await Upload.create({
    key, bucket: env.s3.bucket, purpose,
    owner: user._id, ownerRole: user.role,
    originalName: safeName(filename),
    contentType, size: bytes,
    status: 'pending',
  });

  const url = await getSignedUrl(getS3(), new PutObjectCommand({
    Bucket: env.s3.bucket,
    Key: key,
    ContentType: contentType,
    ContentLength: bytes,
    // Deliberately NO ACL. The bucket is private; everything is read back
    // through a short-lived presigned GET.
    Metadata: { owner: String(user._id), purpose },
  }), { expiresIn: 300 });

  return {
    uploadId: record._id,
    url,
    // The client must send exactly these, or the signature won't verify.
    headers: { 'Content-Type': contentType },
    expiresIn: 300,
  };
}

/**
 * Step 2 — confirm it landed.
 *
 * Without this you're trusting the client's word that the PUT succeeded, and
 * you accumulate `pending` rows for uploads that never happened. HEAD tells us
 * what's actually in the bucket — size and type included, so a client that lied
 * about either is caught here rather than at read time.
 */
export async function confirmUpload({ user, uploadId }) {
  const record = await Upload.findById(uploadId);
  if (!record) throw ApiError.notFound('Upload not found.');
  if (String(record.owner) !== String(user._id) && user.role !== 'admin') {
    throw ApiError.forbidden('That is not your upload.');
  }
  if (record.status === 'ready') return record;   // idempotent — a retry is fine

  let head;
  try {
    head = await getS3().send(new HeadObjectCommand({ Bucket: record.bucket, Key: record.key }));
  } catch {
    record.status = 'failed';
    await record.save();
    throw ApiError.badRequest("That upload didn't complete. Please try again.");
  }

  // Trust the bucket, not the browser.
  record.size = head.ContentLength ?? record.size;
  record.contentType = head.ContentType || record.contentType;

  const spec = PURPOSES[record.purpose];
  if (spec && record.size > spec.maxBytes) {
    // Bigger than declared — remove it rather than keep something we rejected.
    await remove(record.key).catch(() => {});
    record.status = 'failed';
    await record.save();
    throw ApiError.badRequest(`That file is over the ${Math.round(spec.maxBytes / 1024 / 1024)}MB limit.`);
  }

  record.status = 'ready';
  record.uploadedAt = new Date();
  await record.save();
  return record;
}

/**
 * A short-lived read URL.
 *
 * Five minutes. Long enough to click, short enough that a URL pasted into a
 * WhatsApp group stops working. The bucket stays private; this is the only way
 * anything is read.
 */
export async function signedDownload(record, { inline = false, expiresIn = 300 } = {}) {
  const disposition = `${inline ? 'inline' : 'attachment'}; filename="${record.originalName}"`;
  return getSignedUrl(getS3(), new GetObjectCommand({
    Bucket: record.bucket,
    Key: record.key,
    ResponseContentDisposition: disposition,
    // Force the stored type. If something odd ever landed in the bucket, this
    // stops the browser sniffing it into HTML and running it.
    ResponseContentType: record.contentType,
  // Capped at 900s. Inline images get the longer end (a résumé photo must not
  // 404 while someone fills in a form); downloads keep the 5-minute default.
  }), { expiresIn: Math.min(expiresIn, 900) });
}

export async function remove(key) {
  if (!isStorageEnabled()) return;
  await getS3().send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
}

/** Replacing a file: point at the new one, delete the old. Never orphan bytes. */
export async function replace({ oldUploadId, newUploadId }) {
  if (!oldUploadId || String(oldUploadId) === String(newUploadId)) return;
  const old = await Upload.findById(oldUploadId);
  if (!old) return;
  await remove(old.key).catch((e) => console.warn('[storage] could not delete', old.key, e.message));
  old.status = 'deleted';
  await old.save();
}
