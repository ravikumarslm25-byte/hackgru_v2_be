import mongoose from 'mongoose';

const caseResultSchema = new mongoose.Schema({
  index: Number, passed: Boolean, points: Number,
}, { _id: false });

const codeSubmissionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    problem: { type: mongoose.Schema.Types.ObjectId, ref: 'Problem', required: true, index: true },
    language: String,
    source: String,
    verdict: { type: String, enum: ['accepted', 'wrong', 'error'], default: 'wrong' },
    passedCount: { type: Number, default: 0 },
    totalCount: { type: Number, default: 0 },
    pointsEarned: { type: Number, default: 0 },
    totalPoints: { type: Number, default: 0 },
    results: [caseResultSchema],
  },
  { timestamps: true }
);
codeSubmissionSchema.index({ student: 1, problem: 1 });
export const CodeSubmission = mongoose.model('CodeSubmission', codeSubmissionSchema);
