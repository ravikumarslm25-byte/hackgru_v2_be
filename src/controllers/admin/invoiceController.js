import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { CollegeInvoice } from '../../models/org/CollegeInvoice.js';
import { Batch } from '../../models/org/Batch.js';
import { Enrollment } from '../../models/Enrollment.js';

async function nextNumber() {
  const year = new Date().getFullYear();
  const last = await CollegeInvoice.findOne({ number: new RegExp(`^INV-${year}-`) }).sort('-number').lean();
  const seq = last ? Number(last.number.split('-')[2]) + 1 : 1;
  return `INV-${year}-${String(seq).padStart(4, '0')}`;
}

const view = (i) => ({
  id: i._id, number: i.number,
  college: i.college?.name ? { id: i.college._id, name: i.college.name, code: i.college.code } : i.college,
  batch: i.batch?.name ? { id: i.batch._id, name: i.batch.name, code: i.batch.code } : i.batch,
  title: i.title, studentCount: i.studentCount, amount: i.amount, currency: i.currency,
  status: i.status, dueDate: i.dueDate, paidAt: i.paidAt, payMode: i.payMode, reference: i.reference,
  note: i.note, createdAt: i.createdAt,
});

// GET /api/admin/invoices?college=&status=
export const list = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.college) q.college = req.query.college;
  if (req.query.status) q.status = req.query.status;
  const invoices = await CollegeInvoice.find(q).populate('college', 'name code').populate('batch', 'name code').sort('-createdAt');
  const totals = invoices.reduce((a, i) => {
    if (i.status === 'pending') a.pending += i.amount;
    if (i.status === 'paid') a.paid += i.amount;
    return a;
  }, { pending: 0, paid: 0 });
  ok(res, { invoices: invoices.map(view), totals });
});

// POST /api/admin/invoices  { college, batch?, title, amount, dueDate?, note? }
export const create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.college || !b.amount) throw ApiError.badRequest('College and amount are required.');
  let studentCount = 0, course = null;
  if (b.batch) {
    const batch = await Batch.findById(b.batch).lean();
    if (batch) { course = batch.course; studentCount = await Enrollment.countDocuments({ batch: b.batch }); }
  }
  const invoice = await CollegeInvoice.create({
    number: await nextNumber(), college: b.college, batch: b.batch || null, course,
    title: b.title || '', studentCount, amount: Number(b.amount), currency: b.currency || 'INR',
    dueDate: b.dueDate ? new Date(b.dueDate) : null, note: b.note || '', createdBy: req.user._id,
  });
  const full = await CollegeInvoice.findById(invoice._id).populate('college', 'name code').populate('batch', 'name code');
  ok(res, { invoice: view(full) }, 'Invoice created', 201);
});

// PATCH /api/admin/invoices/:id/paid  { payMode?, reference?, paidAt? }
export const markPaid = asyncHandler(async (req, res) => {
  const invoice = await CollegeInvoice.findById(req.params.id);
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  invoice.status = 'paid';
  invoice.paidAt = req.body.paidAt ? new Date(req.body.paidAt) : new Date();
  invoice.payMode = req.body.payMode || invoice.payMode;
  invoice.reference = req.body.reference || invoice.reference;
  await invoice.save();
  const full = await CollegeInvoice.findById(invoice._id).populate('college', 'name code').populate('batch', 'name code');
  ok(res, { invoice: view(full) }, 'Marked paid');
});

// PATCH /api/admin/invoices/:id/cancel
export const cancel = asyncHandler(async (req, res) => {
  const invoice = await CollegeInvoice.findByIdAndUpdate(req.params.id, { $set: { status: 'cancelled' } }, { new: true })
    .populate('college', 'name code').populate('batch', 'name code');
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  ok(res, { invoice: view(invoice) }, 'Invoice cancelled');
});

// DELETE /api/admin/invoices/:id
export const remove = asyncHandler(async (req, res) => {
  const invoice = await CollegeInvoice.findByIdAndDelete(req.params.id);
  if (!invoice) throw ApiError.notFound('Invoice not found.');
  ok(res, { deleted: true }, 'Invoice removed');
});
