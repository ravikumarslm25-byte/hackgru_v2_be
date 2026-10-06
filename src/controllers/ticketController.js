import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Ticket } from '../models/Ticket.js';
import { notifyAdmins, notifyUser } from '../services/notify.js';
import { resolveAttachments, mapAttachments } from '../services/support/attachments.js';

async function nextNumber() {
  const year = new Date().getFullYear();
  const last = await Ticket.findOne({ number: new RegExp(`^TKT-${year}-`) }).sort('-number').lean();
  const seq = last ? Number(last.number.split('-')[2]) + 1 : 1;
  return `TKT-${year}-${String(seq).padStart(4, '0')}`;
}

const listView = (t) => ({
  id: t._id, number: t.number, subject: t.subject, category: t.category, priority: t.priority,
  status: t.status, escalated: t.escalated, lastReplyBy: t.lastReplyBy, lastReplyAt: t.lastReplyAt,
  messages: t.messages?.length || 0,
  attachments: (t.messages || []).reduce((n, m) => n + (m.attachments?.length || 0), 0),
  createdAt: t.createdAt, updatedAt: t.updatedAt,
});
const fullView = (t) => ({
  ...listView(t),
  course: t.course, resolvedAt: t.resolvedAt, closedAt: t.closedAt,
  assignedTo: t.assignedTo?.name ? { name: t.assignedTo.name } : null,
  messages: (t.messages || []).map((m) => ({ id: m._id, role: m.role, authorName: m.authorName, body: m.body, attachments: mapAttachments(m.attachments), createdAt: m.createdAt })),
});

// POST /api/tickets   { subject, category, priority, message, courseId? }
export const createTicket = asyncHandler(async (req, res) => {
  const { subject, category = 'other', priority = 'normal', message, courseId } = req.body;
  const attachments = await resolveAttachments(req.user, req.body.attachments);
  if (!subject) throw ApiError.badRequest('A subject is required.');
  if (!message && attachments.length === 0) throw ApiError.badRequest('Add a description or an attachment.');
  const ticket = await Ticket.create({
    number: await nextNumber(), student: req.user._id, subject, category,
    priority: ['low', 'normal', 'high'].includes(priority) ? priority : 'normal',
    course: courseId || null,
    messages: [{ author: req.user._id, authorName: req.user.name, role: 'student', body: message || '', attachments }],
    lastReplyBy: 'student', lastReplyAt: new Date(),
  });
  notifyAdmins({ type: 'ticket', title: 'New support ticket', body: `${req.user.name}: ${subject}`, link: '/admin/tickets' });
  ok(res, { ticket: fullView(ticket) }, 'Ticket raised', 201);
});

// GET /api/tickets   — my tickets
export const myTickets = asyncHandler(async (req, res) => {
  const tickets = await Ticket.find({ student: req.user._id }).sort('-updatedAt').lean();
  ok(res, { tickets: tickets.map(listView) });
});

// GET /api/tickets/:id
export const getMyTicket = asyncHandler(async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.id, student: req.user._id })
    .populate('assignedTo', 'name').populate('course', 'title').lean();
  if (!t) throw ApiError.notFound('Ticket not found.');
  ok(res, { ticket: fullView(t) });
});

// POST /api/tickets/:id/reply   { message }
export const replyMyTicket = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const attachments = await resolveAttachments(req.user, req.body.attachments);
  if (!message && attachments.length === 0) throw ApiError.badRequest('Write a message or add an attachment.');
  const t = await Ticket.findOne({ _id: req.params.id, student: req.user._id });
  if (!t) throw ApiError.notFound('Ticket not found.');
  if (t.status === 'closed') throw ApiError.badRequest('This ticket is closed. Raise a new one if you still need help.');
  t.messages.push({ author: req.user._id, authorName: req.user.name, role: 'student', body: message || '', attachments });
  t.lastReplyBy = 'student'; t.lastReplyAt = new Date();
  if (t.status === 'resolved') t.status = 'open';   // student came back → reopen
  await t.save();
  if (t.assignedTo) notifyUser(t.assignedTo, { type: 'ticket', title: `Reply on ${t.number}`, body: t.subject, link: '/admin/tickets' });
  else notifyAdmins({ type: 'ticket', title: `Reply on ${t.number}`, body: t.subject, link: '/admin/tickets' });
  const full = await Ticket.findById(t._id).populate('assignedTo', 'name').populate('course', 'title').lean();
  ok(res, { ticket: fullView(full) }, 'Reply sent');
});

// POST /api/tickets/:id/close
export const closeMyTicket = asyncHandler(async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.id, student: req.user._id });
  if (!t) throw ApiError.notFound('Ticket not found.');
  t.status = 'closed'; t.closedAt = new Date();
  await t.save();
  const full = await Ticket.findById(t._id).populate('assignedTo', 'name').populate('course', 'title').lean();
  ok(res, { ticket: fullView(full) }, 'Ticket closed');
});

// POST /api/tickets/:id/reopen
export const reopenMyTicket = asyncHandler(async (req, res) => {
  const t = await Ticket.findOne({ _id: req.params.id, student: req.user._id });
  if (!t) throw ApiError.notFound('Ticket not found.');
  t.status = 'open'; t.closedAt = null; t.resolvedAt = null; t.lastReplyAt = new Date();
  await t.save();
  notifyAdmins({ type: 'ticket', title: `Reopened ${t.number}`, body: t.subject, link: '/admin/tickets' });
  const full = await Ticket.findById(t._id).populate('assignedTo', 'name').populate('course', 'title').lean();
  ok(res, { ticket: fullView(full) }, 'Ticket reopened');
});
