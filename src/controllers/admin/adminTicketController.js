import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Ticket } from '../../models/Ticket.js';
import { User } from '../../models/User.js';
import { Role } from '../../models/Role.js';
import { notifyUser } from '../../services/notify.js';
import { resolveAttachments, mapAttachments } from '../../services/support/attachments.js';

const listView = (t) => ({
  id: t._id, number: t.number, subject: t.subject, category: t.category, priority: t.priority,
  status: t.status, escalated: t.escalated, lastReplyBy: t.lastReplyBy, lastReplyAt: t.lastReplyAt,
  student: t.student?.name ? { id: t.student._id, name: t.student.name, email: t.student.email } : null,
  assignedTo: t.assignedTo?.name ? { id: t.assignedTo._id, name: t.assignedTo.name } : null,
  messages: t.messages?.length || 0,
  attachments: (t.messages || []).reduce((n, m) => n + (m.attachments?.length || 0), 0),
  createdAt: t.createdAt, updatedAt: t.updatedAt,
});
const fullView = (t) => ({
  ...listView(t), course: t.course, resolvedAt: t.resolvedAt, closedAt: t.closedAt, escalatedAt: t.escalatedAt,
  messages: (t.messages || []).map((m) => ({ id: m._id, role: m.role, authorName: m.authorName, body: m.body, attachments: mapAttachments(m.attachments), createdAt: m.createdAt })),
});

// GET /api/admin/tickets?status=&priority=&assignedTo=&escalated=&q=
export const listTickets = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  if (req.query.priority) q.priority = req.query.priority;
  if (req.query.assignedTo) q.assignedTo = req.query.assignedTo === 'unassigned' ? null : req.query.assignedTo;
  if (req.query.escalated === 'true') q.escalated = true;
  if (req.query.q) q.$or = [{ subject: new RegExp(req.query.q, 'i') }, { number: new RegExp(req.query.q, 'i') }];
  const tickets = await Ticket.find(q).populate('student', 'name email').populate('assignedTo', 'name').sort('-updatedAt').lean();
  const counts = await Ticket.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  byStatus.escalated = await Ticket.countDocuments({ escalated: true, status: { $nin: ['closed'] } });
  ok(res, { tickets: tickets.map(listView), counts: byStatus });
});

// PATCH /api/admin/tickets/bulk   { ids, assignedToId?, status?, priority?, escalated? }
export const bulkUpdateTickets = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) throw ApiError.badRequest('No tickets selected.');
  const set = {};
  if (req.body.assignedToId !== undefined) set.assignedTo = req.body.assignedToId || null;
  if (req.body.status && ['open', 'in_progress', 'resolved', 'closed'].includes(req.body.status)) {
    set.status = req.body.status;
    if (req.body.status === 'resolved') set.resolvedAt = new Date();
    if (req.body.status === 'closed') set.closedAt = new Date();
  }
  if (req.body.priority && ['low', 'normal', 'high'].includes(req.body.priority)) set.priority = req.body.priority;
  if (req.body.escalated !== undefined) { set.escalated = Boolean(req.body.escalated); if (set.escalated) { set.escalatedAt = new Date(); set.priority = 'high'; } }
  if (Object.keys(set).length === 0) throw ApiError.badRequest('Nothing to update.');
  const result = await Ticket.updateMany({ _id: { $in: ids } }, { $set: set });
  ok(res, { updated: result.modifiedCount ?? ids.length }, 'Tickets updated');
});

// GET /api/admin/tickets/meta — assignable staff + admins
export const ticketMeta = asyncHandler(async (req, res) => {
  const roleIds = await Role.find({ permissions: 'tickets.manage' }).distinct('_id');
  const staff = await User.find({
    isActive: { $ne: false },
    $or: [{ role: 'admin' }, { role: 'staff', staffRole: { $in: roleIds } }],
  }).select('name role').sort('name').lean();
  ok(res, { assignees: staff.map((u) => ({ id: u._id, name: u.name, role: u.role })) });
});

// GET /api/admin/tickets/:id
export const getTicket = asyncHandler(async (req, res) => {
  const t = await Ticket.findById(req.params.id)
    .populate('student', 'name email').populate('assignedTo', 'name').populate('course', 'title').lean();
  if (!t) throw ApiError.notFound('Ticket not found.');
  ok(res, { ticket: fullView(t) });
});

// POST /api/admin/tickets/:id/reply   { message }
export const replyTicket = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const attachments = await resolveAttachments(req.user, req.body.attachments);
  if (!message && attachments.length === 0) throw ApiError.badRequest('Write a message or add an attachment.');
  const t = await Ticket.findById(req.params.id);
  if (!t) throw ApiError.notFound('Ticket not found.');
  t.messages.push({ author: req.user._id, authorName: req.user.name, role: 'staff', body: message || '', attachments });
  t.lastReplyBy = 'staff'; t.lastReplyAt = new Date();
  if (t.status === 'open') t.status = 'in_progress';
  if (!t.assignedTo) t.assignedTo = req.user._id;
  await t.save();
  notifyUser(t.student, { type: 'ticket', title: `Reply on ${t.number}`, body: t.subject, link: '/dashboard/support' });
  const full = await Ticket.findById(t._id).populate('student', 'name email').populate('assignedTo', 'name').populate('course', 'title').lean();
  ok(res, { ticket: fullView(full) }, 'Reply sent');
});

// PATCH /api/admin/tickets/:id   { status?, priority?, assignedToId?, escalated? }
export const updateTicket = asyncHandler(async (req, res) => {
  const t = await Ticket.findById(req.params.id);
  if (!t) throw ApiError.notFound('Ticket not found.');
  const b = req.body;
  let statusChanged = false;
  if (b.status && ['open', 'in_progress', 'resolved', 'closed'].includes(b.status)) {
    statusChanged = b.status !== t.status;
    t.status = b.status;
    if (b.status === 'resolved') t.resolvedAt = new Date();
    if (b.status === 'closed') t.closedAt = new Date();
  }
  if (b.priority && ['low', 'normal', 'high'].includes(b.priority)) t.priority = b.priority;
  if (b.assignedToId !== undefined) t.assignedTo = b.assignedToId || null;
  if (b.escalated !== undefined) {
    t.escalated = Boolean(b.escalated);
    if (t.escalated) { t.escalatedAt = new Date(); t.priority = 'high'; }
  }
  await t.save();
  if (statusChanged) notifyUser(t.student, { type: 'ticket', title: `${t.number} ${t.status.replace('_', ' ')}`, body: t.subject, link: '/dashboard/support' });
  const full = await Ticket.findById(t._id).populate('student', 'name email').populate('assignedTo', 'name').populate('course', 'title').lean();
  ok(res, { ticket: fullView(full) }, 'Ticket updated');
});
