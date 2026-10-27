import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { LiveClass } from '../../models/LiveClass.js';
import { LiveRegistration } from '../../models/LiveRegistration.js';

const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Fields an admin may set on a class (slots have their own endpoints). */
const CLASS_FIELDS = [
  'title', 'titleAccent', 'tagline', 'eyebrow', 'price', 'mrp', 'currency',
  'startsOn', 'timings', 'trustText', 'instructor', 'highlights', 'stats', 'faqs', 'active',
];
const pick = (body) => CLASS_FIELDS.reduce((o, k) => (body[k] !== undefined ? ((o[k] = body[k]), o) : o), {});

// @route GET /api/admin/live-classes  — list with registration counts
export const listClasses = asyncHandler(async (_req, res) => {
  const classes = await LiveClass.find().sort('-createdAt').lean();
  const ids = classes.map((c) => c._id);
  const counts = await LiveRegistration.aggregate([
    { $match: { liveClass: { $in: ids } } },
    { $group: { _id: '$liveClass', total: { $sum: 1 }, paid: { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] } } } },
  ]);
  const byId = new Map(counts.map((c) => [String(c._id), c]));
  const rows = classes.map((c) => ({
    ...c,
    registrations: byId.get(String(c._id))?.total || 0,
    paidCount: byId.get(String(c._id))?.paid || 0,
    slotCount: (c.slots || []).length,
  }));
  ok(res, { classes: rows });
});

// @route POST /api/admin/live-classes
export const createClass = asyncHandler(async (req, res) => {
  const body = pick(req.body);
  if (!body.title) throw ApiError.badRequest('Title is required.');
  if (body.price == null) throw ApiError.badRequest('Price is required.');

  let slug = slugify(req.body.slug || body.title);
  if (!slug) throw ApiError.badRequest('Could not derive a URL slug from the title.');
  // Ensure the slug is unique (append -2, -3, … if needed).
  let unique = slug, n = 1;
  while (await LiveClass.exists({ slug: unique })) unique = `${slug}-${++n}`;

  const cls = await LiveClass.create({ ...body, slug: unique, slots: req.body.slots || [] });
  ok(res, { class: cls }, 'Live class created', 201);
});

// @route GET /api/admin/live-classes/:id
export const getClass = asyncHandler(async (req, res) => {
  const cls = await LiveClass.findById(req.params.id);
  if (!cls) throw ApiError.notFound('Class not found.');
  ok(res, { class: cls });
});

// @route PATCH /api/admin/live-classes/:id
export const updateClass = asyncHandler(async (req, res) => {
  const cls = await LiveClass.findById(req.params.id);
  if (!cls) throw ApiError.notFound('Class not found.');

  Object.assign(cls, pick(req.body));
  // Allow renaming the slug, keeping it unique.
  if (req.body.slug && slugify(req.body.slug) !== cls.slug) {
    let slug = slugify(req.body.slug), unique = slug, n = 1;
    while (await LiveClass.exists({ slug: unique, _id: { $ne: cls._id } })) unique = `${slug}-${++n}`;
    cls.slug = unique;
  }
  await cls.save();
  ok(res, { class: cls }, 'Saved');
});

// @route DELETE /api/admin/live-classes/:id
export const deleteClass = asyncHandler(async (req, res) => {
  const cls = await LiveClass.findById(req.params.id);
  if (!cls) throw ApiError.notFound('Class not found.');
  await LiveRegistration.deleteMany({ liveClass: cls._id });
  await cls.deleteOne();
  ok(res, {}, 'Class and its registrations removed');
});

// ── Slots ──────────────────────────────────────────────────────────────────

// @route POST /api/admin/live-classes/:id/slots
export const addSlot = asyncHandler(async (req, res) => {
  const { date, time, seatsTotal, startAt } = req.body;
  if (!date || !time) throw ApiError.badRequest('Slot date and time labels are required.');
  const cls = await LiveClass.findById(req.params.id);
  if (!cls) throw ApiError.notFound('Class not found.');
  const seats = Number(seatsTotal) || 40;
  cls.slots.push({ date, time, startAt: startAt || null, seatsTotal: seats, seatsLeft: seats, active: true });
  await cls.save();
  ok(res, { class: cls }, 'Slot added', 201);
});

// @route PATCH /api/admin/live-classes/:id/slots/:slotId
export const updateSlot = asyncHandler(async (req, res) => {
  const cls = await LiveClass.findById(req.params.id);
  if (!cls) throw ApiError.notFound('Class not found.');
  const slot = cls.slots.id(req.params.slotId);
  if (!slot) throw ApiError.notFound('Slot not found.');

  const { date, time, seatsTotal, seatsLeft, active, startAt } = req.body;
  if (date !== undefined) slot.date = date;
  if (time !== undefined) slot.time = time;
  if (startAt !== undefined) slot.startAt = startAt || null;
  if (active !== undefined) slot.active = Boolean(active);
  if (seatsTotal !== undefined) slot.seatsTotal = Math.max(0, Number(seatsTotal) || 0);
  if (seatsLeft !== undefined) slot.seatsLeft = Math.max(0, Number(seatsLeft) || 0);
  else if (seatsTotal !== undefined && slot.seatsLeft > slot.seatsTotal) slot.seatsLeft = slot.seatsTotal;
  await cls.save();
  ok(res, { class: cls }, 'Slot updated');
});

// @route DELETE /api/admin/live-classes/:id/slots/:slotId
export const deleteSlot = asyncHandler(async (req, res) => {
  const cls = await LiveClass.findById(req.params.id);
  if (!cls) throw ApiError.notFound('Class not found.');
  const slot = cls.slots.id(req.params.slotId);
  if (!slot) throw ApiError.notFound('Slot not found.');
  slot.deleteOne();
  await cls.save();
  ok(res, { class: cls }, 'Slot removed');
});

// ── Registrations (separate roster per class) ────────────────────────────────

// @route GET /api/admin/live-classes/:id/registrations
export const listRegistrations = asyncHandler(async (req, res) => {
  const cls = await LiveClass.findById(req.params.id).lean();
  if (!cls) throw ApiError.notFound('Class not found.');
  const registrations = await LiveRegistration.find({ liveClass: cls._id }).sort('-createdAt').lean();
  ok(res, {
    class: { id: cls._id, title: cls.title, slug: cls.slug, price: cls.price },
    registrations,
  });
});

// @route POST /api/admin/live-classes/registrations/:regId/mark-paid
export const markRegistrationPaid = asyncHandler(async (req, res) => {
  const reg = await LiveRegistration.findById(req.params.regId);
  if (!reg) throw ApiError.notFound('Registration not found.');
  if (reg.paymentStatus === 'paid') return ok(res, { registration: reg }, 'Already marked paid');

  reg.paymentStatus = 'paid';
  reg.paidAt = new Date();
  reg.method = reg.method || 'manual';
  reg.manuallyMarkedBy = req.user._id;
  if (req.body?.notes) reg.notes = req.body.notes;
  await reg.save();

  ok(res, { registration: reg }, 'Marked as paid');
});

// @route DELETE /api/admin/live-classes/registrations/:regId
export const deleteRegistration = asyncHandler(async (req, res) => {
  const reg = await LiveRegistration.findById(req.params.regId);
  if (!reg) throw ApiError.notFound('Registration not found.');
  await reg.deleteOne();
  ok(res, {}, 'Registration removed');
});
