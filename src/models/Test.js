import mongoose from 'mongoose';

/**
 * A Test (mock test / quiz / proctored exam) belongs to a course. Questions are
 * embedded. Supports MCQ (single/multiple), fill-in-the-blank and paragraph types,
 * and an optional secure-proctoring configuration (face tracking, ID verification,
 * browser lockdown) — used to power secure online exams.
 */
const optionSchema = new mongoose.Schema({
  text: { type: String, required: true, trim: true },
  isCorrect: { type: Boolean, default: false },
}, { _id: true });

const questionSchema = new mongoose.Schema({
  text: { type: String, default: '', trim: true },   // required only at publish (see admin validateForPublish)
  // single/multiple = MCQ; fill_blank = short text; paragraph = long text (manual grade)
  type: { type: String, enum: ['single', 'multiple', 'fill_blank', 'paragraph'], default: 'single' },
  section: { type: mongoose.Schema.Types.ObjectId, default: null },   // → a Test.sections _id
  options: [optionSchema],                 // MCQ only
  acceptedAnswers: [{ type: String }],     // fill_blank — any match (case/space-insensitive) is correct
  marks: { type: Number, default: 1, min: 0 },
  explanation: { type: String, default: '' },
  order: { type: Number, default: 0 },
}, { _id: true });

/**
 * A section groups questions of one kind (e.g. "Fill in the blank"). It sets the
 * marks per question and how many of its questions a candidate must answer —
 * `answerCount` < number given means "choose N of M" (best N are counted).
 */
const sectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  marksPerQuestion: { type: Number, default: 1, min: 0 },
  answerCount: { type: Number, default: 0, min: 0 },   // 0 = answer all given
  order: { type: Number, default: 0 },
}, { _id: true });

const proctoringSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  faceTracking: { type: Boolean, default: true },     // webcam face/gaze monitoring
  idVerification: { type: Boolean, default: true },   // face + physical ID before start
  browserLock: { type: Boolean, default: true },      // fullscreen + tab/blur detection
  maxViolations: { type: Number, default: 3 },        // flag/terminate after this many
  lookAwaySeconds: { type: Number, default: 3 },      // sustained look-away → a violation
  terminateOnMax: { type: Boolean, default: false },  // auto-end (vs pause for review)
}, { _id: false });

const testSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },

    durationMin: { type: Number, default: 0 },
    passPercent: { type: Number, default: 40 },
    negativeMarkPerWrong: { type: Number, default: 0 },
    shuffleQuestions: { type: Boolean, default: false },
    shuffleOptions: { type: Boolean, default: false },
    attemptsAllowed: { type: Number, default: 0 },

    isFree: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
    order: { type: Number, default: 0 },

    proctoring: { type: proctoringSchema, default: () => ({}) },
    sections: [sectionSchema],
    questions: [questionSchema],
  },
  { timestamps: true }
);

testSchema.virtual('totalMarks').get(function () {
  const secs = this.sections || [];
  if (secs.length === 0) return (this.questions || []).reduce((n, q) => n + (q.marks || 0), 0);
  let total = 0;
  for (const sec of secs) {
    const given = (this.questions || []).filter((q) => String(q.section) === String(sec._id)).length;
    const n = sec.answerCount > 0 ? Math.min(sec.answerCount, given) : given;
    total += n * (sec.marksPerQuestion || 0);
  }
  // any questions not in a section still count individually
  total += (this.questions || []).filter((q) => !q.section).reduce((n, q) => n + (q.marks || 0), 0);
  return total;
});
testSchema.set('toJSON', { virtuals: true });
testSchema.set('toObject', { virtuals: true });

export const Test = mongoose.model('Test', testSchema);
