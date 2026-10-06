import mongoose from 'mongoose';

/**
 * A student's project submission for a course. Gated by the course's
 * allowProjectUpload flag. Students may attach PDF/image files and/or a link
 * (e.g. a demo video URL) — three formats only, enforced at upload + here.
 */
const projectSubmissionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },

    title: { type: String, default: '' },
    note: { type: String, default: '' },
    link: { type: String, default: '' },            // demo / video / repo link
    files: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Upload' }],

    status: { type: String, enum: ['submitted', 'reviewed'], default: 'submitted' },
    score: { type: Number, default: null },
    feedback: { type: String, default: '' },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One submission per student per course (they update it).
projectSubmissionSchema.index({ student: 1, course: 1 }, { unique: true });

export const ProjectSubmission = mongoose.model('ProjectSubmission', projectSubmissionSchema);
