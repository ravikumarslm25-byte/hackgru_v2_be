import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, required: true },
  selected: [{ type: mongoose.Schema.Types.ObjectId }],   // MCQ chosen option ids
  text: { type: String, default: '' },                    // fill_blank / paragraph answer
  correct: { type: Boolean, default: false },
  awarded: { type: Number, default: 0 },
  needsReview: { type: Boolean, default: false },         // paragraph — manual grading pending
  counted: { type: Boolean, default: true },              // counted toward score (choose-N sections)
}, { _id: false });

const violationSchema = new mongoose.Schema({
  type: { type: String, required: true },   // no_face | multiple_faces | looking_away | tab_switch | fullscreen_exit | copy | paste | shortcut | devtools
  detail: { type: String, default: '' },
  screenshot: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
  at: { type: Date, default: Date.now },
}, { _id: true });

const proctoringSchema = new mongoose.Schema({
  idFace: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },   // live face snapshot
  idCard: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },   // physical ID snapshot
  verifiedAt: { type: Date, default: null },
  violations: [violationSchema],
  flagged: { type: Boolean, default: false },
  terminatedReason: { type: String, default: '' },
}, { _id: false });

const testAttemptSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    test: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true, index: true },
    answers: [answerSchema],
    score: { type: Number, default: 0 },
    maxScore: { type: Number, default: 0 },
    percent: { type: Number, default: 0 },
    passed: { type: Boolean, default: false },
    needsReview: { type: Boolean, default: false },   // has paragraph answers pending grading
    status: { type: String, enum: ['in_progress', 'submitted', 'flagged', 'terminated'], default: 'submitted' },
    proctored: { type: Boolean, default: false },
    proctoring: { type: proctoringSchema, default: () => ({}) },
    startedAt: { type: Date, default: null },
    durationTakenSec: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
testAttemptSchema.index({ student: 1, test: 1 });
export const TestAttempt = mongoose.model('TestAttempt', testAttemptSchema);
