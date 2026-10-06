import mongoose from 'mongoose';

/**
 * A cohort of students from one college department taking one course.
 *
 * Created automatically when an admin generates a registration link — one link
 * produces exactly one batch. This is the ONLY thing that ties a student to a
 * college, which is what makes the visibility rule structural rather than a
 * filter someone can forget.
 */
const batchSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Auto-generated, human-readable: ANNA-CHN/CSE/REACT-FULL-STACK/01 */
    code: { type: String, required: true, unique: true, uppercase: true },

    /**
     * Institutional batches belong to a college (one or more departments). Open
     * batches (online events, public cohorts) have no college — anyone can join,
     * including working professionals and job seekers.
     */
    institutional: { type: Boolean, default: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', default: null, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },

    academicYear: { type: String, default: '' },   // '2026-27'
    startDate: { type: Date },
    endDate: { type: Date },
    /** Seat cap. null / 0 = unlimited. */
    seats: { type: Number, default: null },

    status: {
      type: String,
      enum: ['draft', 'open', 'running', 'completed', 'cancelled'],
      default: 'open', index: true,
    },

    /** Denormalised counters — kept current by the registration flow. */
    stats: {
      registered: { type: Number, default: 0 },
      paid: { type: Number, default: 0 },
    },

    /** Set when someone paid after the last seat was taken. They keep their
     *  place — an admin decides whether to add a seat or refund. */
    overCapacity: { type: Boolean, default: false },

    /**
     * Program access for the whole batch, granted by an admin WITHOUT payment
     * (the college-management-pays / postpaid model). Access is delivered as
     * granted entitlements; this just records the batch-level state so new
     * students who register later inherit it and so it can be revoked in one go.
     */
    accessGranted: { type: Boolean, default: false },
    accessGrantedAt: { type: Date, default: null },
    accessExpiresAt: { type: Date, default: null },
    accessGrantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

batchSchema.index({ college: 1, department: 1, status: 1 });

export const Batch = mongoose.model('Batch', batchSchema);
