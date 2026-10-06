import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema({
  order: Number,
  title: String,
  why: String,                 // why this matters for THEIR goal
  youWillLearn: [String],
  youWillBuild: String,
  proveIt: String,             // the artifact that proves it
  subskills: [String],
  estimatedWeeks: Number,
  estimatedHours: Number,
  ourCourse: {                 // populated only if we actually cover it
    slug: String, title: String, price: Number,
  },
  alternatives: [String],      // honest self-study path — always present
}, { _id: false });

const candidateSchema = new mongoose.Schema({
  role: String,
  label: String,
  interestScore: Number,
  aptitudeScore: Number,
  marketScore: Number,
  overall: Number,
  evidence: [String],          // WHY we suggested this — must be explainable
  dayInTheLife: String,
  probe: { weeks: Number, brief: String },
}, { _id: false });

const resultSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    session: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
    path: { type: String, enum: ['clear', 'discovery'] },

    /** Per-subskill: { value, confidence, band, target, gap } */
    subskills: { type: Object, default: {} },
    /** Per-dimension rollup: { value, confidence, band } */
    dimensions: { type: Object, default: {} },

    strengths: [{ subskill: String, label: String, value: Number, note: String }],
    weaknesses: [{ subskill: String, label: String, value: Number, gap: Number, note: String }],

    /** Inventory outputs — profiles, never grades */
    workStyle: { type: Object, default: {} },
    eqProfile: { type: Object, default: {} },
    interests: { type: Object, default: {} },

    goal: {
      status: { type: String, enum: ['stated', 'discovered', 'unclear'] },
      role: String,
      label: String,
      timelineWeeks: Number,
      hoursPerWeek: Number,
    },
    candidates: [candidateSchema],   // discovery path

    readiness: {
      overall: Number,               // 0-100 vs target role
      band: String,                  // 'exploring' | 'foundation' | 'building' | 'interview-ready'
      verdict: String,               // honest read on the timeline
      evidenceCoverage: Number,      // % of the verdict backed by things we actually tested
      feasible: Boolean,
      requiredHours: Number,
      availableHours: Number,
      suggestedTimelineWeeks: Number,
    },

    journey: [milestoneSchema],
    firstWeek: [String],
    checkpoints: [{ afterMilestone: Number, retestDimensions: [String], note: String }],

    narrative: {
      source: { type: String, enum: ['ai', 'rules'], default: 'rules' },
      headline: String,
      currentLevel: String,
      whatsNext: String,
      howItsPossible: String,
      encouragement: String,
    },

    itemReview: [{ stem: String, yourAnswer: String, correct: Boolean, explanation: String }],

    engineVersion: { type: String, default: '1.0' },
    takenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

resultSchema.index({ student: 1, takenAt: -1 });

export const Result = mongoose.model('Result', resultSchema);
