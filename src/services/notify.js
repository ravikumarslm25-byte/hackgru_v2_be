import { Notification } from '../models/Notification.js';
import { User } from '../models/User.js';

/** Notify a single user. */
export async function notifyUser(userId, payload) {
  try {
    if (!userId) return;
    await Notification.create({ user: userId, ...payload });
  } catch (err) {
    console.error('[notify] user failed:', err.message);
  }
}

/** Notify every admin (fan-out, one row each). */
export async function notifyAdmins(payload) {
  try {
    const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
    if (!admins.length) return;
    await Notification.insertMany(admins.map((a) => ({ user: a._id, ...payload })));
  } catch (err) {
    console.error('[notify] admins failed:', err.message);
  }
}

/** Notify every spoc attached to a college. */
export async function notifyCollegeSpocs(collegeId, payload) {
  try {
    if (!collegeId) return;
    const spocs = await User.find({ role: 'spoc', isActive: true, 'spocAccess.college': collegeId })
      .select('_id').lean();
    if (!spocs.length) return;
    await Notification.insertMany(spocs.map((s) => ({ user: s._id, ...payload })));
  } catch (err) {
    console.error('[notify] college spocs failed:', err.message);
  }
}
