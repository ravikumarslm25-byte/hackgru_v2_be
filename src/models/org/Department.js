import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema(
  {
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
    name: { type: String, required: true, trim: true },     // 'Computer Science and Engineering'
    code: { type: String, required: true, uppercase: true, trim: true }, // 'CSE'
    hod: { name: String, email: String, phone: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// A department code is unique within its college, not globally —
// every college has a CSE.
departmentSchema.index({ college: 1, code: 1 }, { unique: true });

export const Department = mongoose.model('Department', departmentSchema);
