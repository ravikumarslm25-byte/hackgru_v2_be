import mongoose from 'mongoose';

/** A dynamic staff role (Teacher, Trainer, Operations, Sales, Support, …) with a
 *  set of permission keys. Users of role 'staff' point to one of these. */
const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    permissions: [{ type: String }],
    isSystem: { type: Boolean, default: false },   // seeded, name/key locked
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);
export const Role = mongoose.model('Role', roleSchema);
