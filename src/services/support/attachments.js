import { Upload } from '../../models/Upload.js';

/**
 * Turn a list of upload ids (already presigned + confirmed) into validated
 * message attachments. Only the uploader's own, ready, ticket-purpose uploads
 * survive — so nobody can attach a file id that isn't theirs. Max 5 per message.
 */
export async function resolveAttachments(user, ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const clean = [...new Set(ids.filter(Boolean).map(String))].slice(0, 5);
  if (clean.length === 0) return [];
  const uploads = await Upload.find({
    _id: { $in: clean }, owner: user._id, purpose: 'ticket-attachment', status: 'ready',
  }).lean();
  const byId = Object.fromEntries(uploads.map((u) => [String(u._id), u]));
  // Preserve the order the client sent.
  return clean.filter((id) => byId[id]).map((id) => {
    const u = byId[id];
    return { upload: u._id, name: u.originalName, contentType: u.contentType, size: u.size };
  });
}

export const mapAttachments = (arr = []) =>
  arr.map((a) => ({
    id: a.upload, name: a.name, contentType: a.contentType, size: a.size,
    isImage: (a.contentType || '').startsWith('image/'),
  }));
