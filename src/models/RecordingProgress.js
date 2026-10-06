import mongoose from 'mongoose';

/** Per-student, per-lesson watch progress for recordings. */
const recordingProgressSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    lesson: { type: mongoose.Schema.Types.ObjectId, required: true },   // recordingSections.lessons._id
    positionSec: { type: Number, default: 0 },      // resume point
    completed: { type: Boolean, default: false },
  },
  { timestamps: true }
);
recordingProgressSchema.index({ student: 1, course: 1, lesson: 1 }, { unique: true });
export const RecordingProgress = mongoose.model('RecordingProgress', recordingProgressSchema);
