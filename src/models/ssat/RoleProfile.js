import mongoose from 'mongoose';

/**
 * The target a student is benchmarked against.
 * ⚠️ requiredLevels/importance are a DRAFT for mentor review — see seed/ssat/roles.data.js
 */
const roleProfileSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, unique: true },   // 'frontend-developer'
    label: { type: String, required: true },                // 'Frontend Developer'
    family: { type: String },                               // 'development' | 'design' | 'testing' | 'data' | 'emerging'
    summary: { type: String, default: '' },
    dayInTheLife: { type: String, default: '' },

    /** subskill → level 0-100 a junior hire is expected to clear */
    requiredLevels: { type: Object, default: {} },
    /** subskill → 0-1 weight of how much it matters for this role */
    importance: { type: Object, default: {} },

    /** Which interest axes this role rewards */
    interestAxes: [{ type: String }],

    marketDemand: { type: Number, min: 0, max: 100, default: 70 },
    entrySalaryBand: { type: String, default: '' },         // India, junior
    typicalTitles: [{ type: String }],
    hiringCompanies: [{ type: String }],

    /** Ordered milestone template — the journey engine fills in the detail */
    milestoneTemplate: [{
      title: String,
      subskills: [String],
      youWillBuild: String,
      proveIt: String,
      baseHours: Number,
    }],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const RoleProfile = mongoose.model('RoleProfile', roleProfileSchema);
