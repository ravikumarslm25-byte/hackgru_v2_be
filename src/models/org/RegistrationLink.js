import mongoose from 'mongoose';
import crypto from 'crypto';

/**
 * A special registration link: hackgru.com/join/<token>
 *
 * College, department and course are fixed by the admin at creation, so the
 * student only supplies name / register number / year / contact, then pays.
 * One link = one batch.
 */
const registrationLinkSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },

    /** Institutional (college + department[s]) vs open (public/online event). */
    institutional: { type: Boolean, default: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', default: null, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', required: true, index: true },

    /** Optional negotiated price for this college. Falls back to course.price. */
    priceOverride: { type: Number, default: null, min: 0 },

    /**
     * Free / college-sponsored registration. When true, students who register via
     * this link skip payment entirely and are granted the course's included access
     * immediately (management-pays / postpaid model). Optional expiry.
     */
    freeAccess: { type: Boolean, default: false },
    accessExpiresAt: { type: Date, default: null },

    /** Seat cap. null / 0 means unlimited — anyone with the link can join. */
    maxSeats: { type: Number, default: null },
    usedSeats: { type: Number, default: 0 },

    expiresAt: { type: Date, index: true },
    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    label: { type: String, default: '' },  // admin-facing note
  },
  { timestamps: true }
);

/** URL-safe, unguessable. 12 bytes ≈ 96 bits — no enumeration. */
registrationLinkSchema.statics.newToken = () => crypto.randomBytes(12).toString('base64url');

/** Can a student still use this link? One place, so every caller agrees. */
registrationLinkSchema.methods.availability = function () {
  if (!this.isActive) return { open: false, reason: 'This registration link has been closed.' };
  if (this.expiresAt && this.expiresAt < new Date()) return { open: false, reason: 'This registration link has expired.' };
  const unlimited = !this.maxSeats;
  if (!unlimited && this.usedSeats >= this.maxSeats) return { open: false, reason: 'All seats for this batch are taken.' };
  return { open: true, seatsLeft: unlimited ? null : this.maxSeats - this.usedSeats };
};

export const RegistrationLink = mongoose.model('RegistrationLink', registrationLinkSchema);
