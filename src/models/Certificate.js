import mongoose from 'mongoose';

/**
 * An issued certificate — one active per student+course. Immutable by design:
 * it stores a resolved SNAPSHOT of everything needed to render, so template
 * edits or a student renaming their account later never change it.
 */
const certificateSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    template: { type: mongoose.Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null },

    serialNo: { type: String, required: true, unique: true, index: true },
    verifyCode: { type: String, required: true, unique: true, index: true },

    // Frozen student identity + course at issue time.
    studentName: { type: String, required: true },
    courseName: { type: String, default: '' },

    type: { type: String, enum: ['completion', 'internship'], default: 'completion' },
    orientation: { type: String, enum: ['landscape', 'portrait'], default: 'landscape' },

    // Internship dates (optional; only for type=internship).
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    duration: { type: String, default: '' },

    issueDate: { type: Date, default: Date.now },
    // A fully-resolved render payload (title, body with placeholders filled,
    // branding, logo URLs resolved at render time from these ids, signatures…).
    snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },

    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    status: { type: String, enum: ['issued', 'revoked'], default: 'issued' },
  },
  { timestamps: true }
);

certificateSchema.index({ student: 1, course: 1 }, { unique: true, partialFilterExpression: { status: 'issued' } });

export const Certificate = mongoose.model('Certificate', certificateSchema);
