import mongoose from 'mongoose';

/**
 * One person registering for one LiveClass, via its public landing page.
 *
 * Kept separate from User/Enrollment on purpose: these are public leads, not
 * LMS students, and the admin wants a clean, separate roster PER class.
 *
 * Flow mirrors the college join flow — the lead is captured first (pending),
 * payment is a second step. A pending row is still a lead the admin can follow up.
 */
const liveRegistrationSchema = new mongoose.Schema(
  {
    liveClass: { type: mongoose.Schema.Types.ObjectId, ref: 'LiveClass', required: true, index: true },
    classSlug: { type: String, index: true },   // denormalised for quick filtering/export
    classTitle: { type: String, default: '' },

    // Which batch/slot they chose (denormalised labels so the roster reads well
    // even if the slot is later edited or removed).
    slotId: { type: mongoose.Schema.Types.ObjectId, default: null },
    slotDate: { type: String, default: '' },
    slotTime: { type: String, default: '' },

    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    amount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },

    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending', index: true },
    paidAt: { type: Date, default: null },

    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    method: { type: String, default: '' },
    methodDetail: { type: String, default: '' },

    // Set by an admin who records an offline payment.
    manuallyMarkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

export const LiveRegistration = mongoose.model('LiveRegistration', liveRegistrationSchema);
