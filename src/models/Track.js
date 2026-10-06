import mongoose from 'mongoose';

/**
 * SECOND level of the catalogue taxonomy (under a Stream). "Track" is internal —
 * shown to students only as its name ("Full-Stack Dev", "UPSC", "TOEFL").
 * Courses and Products live under a Track.
 */
const trackSchema = new mongoose.Schema(
  {
    stream: { type: mongoose.Schema.Types.ObjectId, ref: 'Stream', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, index: true },
    tagline: { type: String, default: '' },
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Slug is unique within a stream (two streams can both have a "foundations" track).
trackSchema.index({ stream: 1, slug: 1 }, { unique: true });

export const Track = mongoose.model('Track', trackSchema);
