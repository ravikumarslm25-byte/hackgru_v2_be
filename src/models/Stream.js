import mongoose from 'mongoose';

/**
 * TOP of the catalogue taxonomy. Internal name only — students never see the word
 * "stream"; they see the name ("Technical Training", "Government Exams", …) in nav.
 * A Stream groups Tracks; a Track groups Courses/Products.
 */
const streamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    tagline: { type: String, default: '' },
    icon: { type: String, default: '' },
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Stream = mongoose.model('Stream', streamSchema);
