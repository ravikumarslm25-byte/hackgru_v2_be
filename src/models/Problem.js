import mongoose from 'mongoose';

const testCaseSchema = new mongoose.Schema({
  input: { type: String, default: '' },
  expectedOutput: { type: String, default: '' },
  isSample: { type: Boolean, default: false },   // shown to the student (example)
  points: { type: Number, default: 1 },
}, { _id: true });

const problemSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true },
    statement: { type: String, default: '' },       // rich HTML
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
    languages: { type: [String], default: ['python', 'cpp', 'java', 'c', 'javascript'] },
    starterCode: { type: Map, of: String, default: {} },   // lang -> starter
    testCases: [testCaseSchema],
    constraints: { type: String, default: '' },
    order: { type: Number, default: 0 },
    isFree: { type: Boolean, default: false },      // solvable without learning access
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);
problemSchema.virtual('totalPoints').get(function () {
  return (this.testCases || []).reduce((n, t) => n + (t.points || 0), 0);
});
problemSchema.set('toJSON', { virtuals: true });
problemSchema.set('toObject', { virtuals: true });
export const Problem = mongoose.model('Problem', problemSchema);
