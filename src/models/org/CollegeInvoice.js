import mongoose from 'mongoose';

/**
 * A billing record for a college engagement — SEPARATE from access. Access is
 * granted on the batch regardless; this tracks what the college owes and whether
 * they've paid (typically postpaid / bank transfer after the program).
 */
const collegeInvoiceSchema = new mongoose.Schema(
  {
    number: { type: String, unique: true, index: true },     // INV-2026-0001
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    title: { type: String, default: '' },
    studentCount: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending', index: true },
    dueDate: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    payMode: { type: String, enum: ['', 'bank_transfer', 'cheque', 'upi', 'other'], default: '' },
    reference: { type: String, default: '' },                // bank/cheque ref
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
export const CollegeInvoice = mongoose.model('CollegeInvoice', collegeInvoiceSchema);
