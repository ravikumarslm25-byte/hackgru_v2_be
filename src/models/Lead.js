import mongoose from 'mongoose';

/** Contact / "Get Started" form submissions. */
const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    institution: { type: String, default: '' },
    interest: { type: String, default: '' },
    message: { type: String, default: '' },
    source: { type: String, default: 'website' },
    status: { type: String, enum: ['new', 'contacted', 'converted', 'closed'], default: 'new' },
  },
  { timestamps: true }
);

export const Lead = mongoose.model('Lead', leadSchema);
