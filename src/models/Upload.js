import mongoose from 'mongoose';

/**
 * One file in S3.
 *
 * `key` is generated server-side from the authenticated user — never from
 * anything a client sent. See services/storage/index.js.
 */
const uploadSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    bucket: { type: String, required: true },
    purpose: { type: String, required: true, index: true },

    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    ownerRole: { type: String, default: 'student' },

    /** For display and Content-Disposition only. Never part of the key. */
    originalName: { type: String, default: 'file' },
    contentType: { type: String, default: '' },
    size: { type: Number, default: 0 },

    /**
     * pending — presigned, not yet confirmed in the bucket
     * ready   — HEAD confirmed it's there
     * failed  — the PUT never landed, or failed validation on confirm
     * deleted — replaced or removed; the object is gone
     */
    status: { type: String, enum: ['pending', 'ready', 'failed', 'deleted'], default: 'pending', index: true },
    uploadedAt: Date,
  },
  { timestamps: true }
);

// Sweep abandoned presigns: someone opened a file picker and wandered off.
uploadSchema.index({ status: 1, createdAt: 1 });

export const Upload = mongoose.model('Upload', uploadSchema);
