import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    upload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', required: true },
    name: { type: String, default: 'file' },
    contentType: { type: String, default: '' },
    size: { type: Number, default: 0 },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, default: '' },
    role: { type: String, enum: ['student', 'staff'], required: true },
    body: { type: String, default: '' },
    attachments: [attachmentSchema],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

/** A support ticket raised by a student. The messages array is the thread. */
const ticketSchema = new mongoose.Schema(
  {
    number: { type: String, unique: true, index: true },   // TKT-2026-0001
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true },
    category: { type: String, enum: ['technical', 'payment', 'content', 'account', 'certificate', 'other'], default: 'other' },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal', index: true },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    escalated: { type: Boolean, default: false, index: true },
    escalatedAt: { type: Date, default: null },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    messages: [messageSchema],
    lastReplyBy: { type: String, enum: ['student', 'staff'], default: 'student' },
    lastReplyAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ticketSchema.index({ status: 1, updatedAt: -1 });
export const Ticket = mongoose.model('Ticket', ticketSchema);
