import mongoose from 'mongoose';

/**
 * THE ACCESS SPINE of v2.
 *
 * "student X may access resource-type Y (for course C, maybe batch B), until Z."
 * Every access gate in the app checks entitlements via the can() helper — nothing
 * checks Enrollment.paid anymore. Paid orders and admin grants both CREATE these;
 * that keeps access logic in exactly one place.
 */
const entitlementSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // What kind of access this grants.
    kind: {
      type: String,
      enum: ['recordings', 'learning', 'mock_tests', 'live_cohort'],
      required: true,
      index: true,
    },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', index: true },
    // Optional batch scope (e.g. a free extra granted to one cohort only).
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },

    source: { type: String, enum: ['purchase', 'grant', 'college_link'], default: 'purchase' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },

    grantedAt: { type: Date, default: Date.now },
    // null = lifetime. A date = access ends then (per-product, stamped at fulfilment).
    expiresAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    // For admin grants — who granted and why.
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

// A student holds at most one live entitlement per (kind, course).
entitlementSchema.index({ student: 1, kind: 1, course: 1 }, { unique: true, partialFilterExpression: { active: true } });

export const Entitlement = mongoose.model('Entitlement', entitlementSchema);
