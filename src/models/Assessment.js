import mongoose from 'mongoose';

/** SSAT — Smart Skill Assessment result for a student. */
const assessmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    track: { type: String, enum: ['technical', 'non-technical', 'company-specific'], required: true },
    scores: [{ skill: String, score: Number }], // e.g. { skill: 'JavaScript', score: 72 }
    overallScore: { type: Number, default: 0 },
    recommendedPath: [{ type: String }],
    completedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Assessment = mongoose.model('Assessment', assessmentSchema);
