import mongoose from 'mongoose';

/**
 * A single assessment item (question).
 *
 * SECURITY: `correctKey` and `explanation` use select:false — they are NEVER
 * returned by a default query, so they cannot leak to the client through a
 * careless populate or spread. The scoring engine explicitly re-selects them.
 */
const itemSchema = new mongoose.Schema(
  {
    dimension: {
      type: String,
      enum: ['technical', 'logical', 'verbal', 'emotional', 'psychological'],
      required: true, index: true,
    },
    // Ability items carry subskills; inventory items carry traits/facets instead.
    subskills: [{ type: String, index: true }],
    trait: { type: String },        // psychological items
    facet: { type: String },        // emotional items

    type: {
      type: String,
      enum: ['mcq', 'code-output', 'code-review', 'debug', 'sjt', 'likert', 'tradeoff', 'work-sample', 'free-text'],
      required: true,
    },

    /** What the item measures. 'potential' items are usable on students with no prior exposure. */
    measures: { type: String, enum: ['knowledge', 'potential'], default: 'knowledge' },

    difficulty: { type: Number, min: 1, max: 5, default: 3 },

    stem: { type: String, required: true },
    code: { type: String, default: '' },          // optional code block
    options: [{ key: String, text: String }],

    correctKey: { type: String, select: false },
    /** For SJT/likert: maps an option key → score contribution per facet/pole. */
    scoreMap: { type: Object, select: false, default: undefined },
    explanation: { type: String, select: false, default: '' },

    rubric: { type: String, select: false, default: '' }, // free-text AI grading rubric

    timeLimitSec: { type: Number, default: 90 },
    tags: [{ type: String }],

    // Live calibration stats — feed a future IRT migration
    stats: {
      timesServed: { type: Number, default: 0 },
      timesCorrect: { type: Number, default: 0 },
      avgTimeMs: { type: Number, default: 0 },
    },

    status: { type: String, enum: ['draft', 'review', 'live', 'retired'], default: 'live', index: true },
    reviewedBy: { type: String, default: '' },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

itemSchema.index({ dimension: 1, difficulty: 1, status: 1 });

/** Observed difficulty from real responses (used to recalibrate the bank). */
itemSchema.virtual('pCorrect').get(function () {
  return this.stats.timesServed ? this.stats.timesCorrect / this.stats.timesServed : null;
});

export const Item = mongoose.model('Item', itemSchema);
