import mongoose from 'mongoose';

const collegeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** Short stable identifier used in batch codes, e.g. 'ANNA-CHN'. */
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    shortName: { type: String, trim: true, default: '' },

    address: {
      line1: String, line2: String, city: String,
      state: String, pincode: String, country: { type: String, default: 'India' },
    },
    /** Primary institutional contact (not a login — that's a spoc User). */
    contact: { name: String, designation: String, email: String, phone: String },

    logo: { type: String, default: '' },
    website: { type: String, default: '' },
    notes: { type: String, default: '' },

    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const College = mongoose.model('College', collegeSchema);
