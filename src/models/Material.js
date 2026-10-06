import mongoose from 'mongoose';

/**
 * A course material. THE ATTACH RULE:
 *   - course is required — a material always belongs to a course.
 *   - batch null  → applies to EVERY cohort of that course (the default).
 *   - batch set   → applies to ONLY that cohort (the "extra doc for this batch
 *                   as per request" case).
 *
 * Student resolution: course = C AND (batch = null OR batch = the student's
 * batch for C). Course-wide defaults + per-batch extras, no duplication.
 */
const materialSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },

    type: { type: String, enum: ['file', 'link', 'text'], required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    // type=file → the uploaded object; type=link → url; type=text → body.
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
    url: { type: String, default: '' },
    body: { type: String, default: '' },

    visibility: { type: String, enum: ['enrolled', 'public'], default: 'enrolled' },
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

materialSchema.index({ course: 1, batch: 1, order: 1 });

export const Material = mongoose.model('Material', materialSchema);
