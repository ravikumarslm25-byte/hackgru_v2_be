import mongoose from 'mongoose';

const responseSchema = new mongoose.Schema({
  item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  dimension: String,
  subskills: [String],
  chosenKey: String,
  text: String,                       // free-text answers
  correct: { type: Boolean, default: null },  // null for inventory items
  difficulty: Number,
  timeTakenMs: Number,
  servedAt: Date,
  answeredAt: Date,
}, { _id: false });

const dialogueSchema = new mongoose.Schema({
  role: { type: String, enum: ['assistant', 'student'] },
  text: String,
  at: { type: Date, default: Date.now },
}, { _id: false });

/**
 * A single sitting of the SSAT. Resumable: state lives here, not in the browser.
 */
const sessionSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    path: { type: String, enum: ['clear', 'discovery'], required: true },
    blueprintKey: { type: String, required: true },

    state: {
      type: String,
      enum: ['in-progress', 'completed', 'abandoned', 'expired'],
      default: 'in-progress', index: true,
    },

    /** Ordered module queue, e.g. ['goal','technical','logical','verbal','workstyle'] */
    modules: [{ type: String }],
    currentModule: { type: String },
    moduleItemCount: { type: Object, default: {} },   // module → items served

    servedItemIds: [{ type: mongoose.Schema.Types.ObjectId }],
    responses: [responseSchema],

    /** Running ability estimate per subskill: { value 0-100, confidence 0-1, n } */
    ability: { type: Object, default: {} },

    /** Profiler answers (goal, constraints, interests) */
    profile: { type: Object, default: {} },

    /** Goal-discovery AI dialogue transcript (path 'discovery' only) */
    dialogue: [dialogueSchema],
    dialogueTurns: { type: Number, default: 0 },

    startedAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    expiresAt: { type: Date, index: true },

    timeSpentMs: { type: Number, default: 0 },
    result: { type: mongoose.Schema.Types.ObjectId, ref: 'Result' },
  },
  { timestamps: true }
);

sessionSchema.index({ student: 1, state: 1 });

export const Session = mongoose.model('Session', sessionSchema);
