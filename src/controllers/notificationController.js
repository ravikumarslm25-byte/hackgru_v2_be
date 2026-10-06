import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/ApiResponse.js';
import { Notification } from '../models/Notification.js';

// @route GET /api/notifications  (recent, current user)
export const listNotifications = asyncHandler(async (req, res) => {
  const items = await Notification.find({ user: req.user._id })
    .sort('-createdAt').limit(30).lean();
  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  ok(res, { items, unread });
});

// @route GET /api/notifications/unread-count
export const unreadCount = asyncHandler(async (req, res) => {
  const unread = await Notification.countDocuments({ user: req.user._id, read: false });
  ok(res, { unread });
});

// @route PATCH /api/notifications/:id/read
export const markRead = asyncHandler(async (req, res) => {
  await Notification.updateOne(
    { _id: req.params.id, user: req.user._id },
    { $set: { read: true, readAt: new Date() } }
  );
  ok(res, { ok: true });
});

// @route POST /api/notifications/read-all
export const markAllRead = asyncHandler(async (req, res) => {
  await Notification.updateMany(
    { user: req.user._id, read: false },
    { $set: { read: true, readAt: new Date() } }
  );
  ok(res, { ok: true });
});

// @route DELETE /api/notifications  (clear all for this user)
export const clearAll = asyncHandler(async (req, res) => {
  await Notification.deleteMany({ user: req.user._id });
  ok(res, { ok: true }, 'Notifications cleared');
});
