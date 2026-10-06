import mongoose from 'mongoose';

/**
 * A per-user notification. Every recipient gets their own row (so read-state is
 * per person). Admin/college events fan out to one row per admin / per spoc.
 */
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, default: 'info' },   // registration | payment_pending | payment_success | lead | info
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' },        // in-app path to open on click
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
    meta: { type: Object, default: {} },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });

export const Notification = mongoose.model('Notification', notificationSchema);
