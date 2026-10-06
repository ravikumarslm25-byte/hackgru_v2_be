import mongoose from 'mongoose';

const lessonSchema = new mongoose.Schema({
  title: { type: String, required: true },
  durationMin: { type: Number, default: 0 },
  videoUrl: { type: String, default: '' },
});

const moduleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  lessons: [lessonSchema],
});

/* ── v2 recordings curriculum (real, gated video content) ──
 * Separate from `modules` (which is the marketing outline shown on the sales
 * page). recordingSections holds the actual private videos students watch once
 * they have a `recordings` entitlement. Each lesson's `video` is an Upload on
 * private S3, played via a short-lived signed URL. */
const recLessonSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  video: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
  durationSec: { type: Number, default: 0 },
  isPreview: { type: Boolean, default: false },   // free to watch without buying
  order: { type: Number, default: 0 },
});
const recSectionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  order: { type: Number, default: 0 },
  lessons: [recLessonSchema],
});

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    program: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
    // v2 catalogue taxonomy (Stream → Track). Optional during migration.
    track: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', index: true },
    // v2 public catalogue taxonomy (Category → Subcategory) — what the store shows.
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null, index: true },
    subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcategory', default: null },
    tagline: { type: String, default: '' },
    summary: { type: String, default: '' },
    thumbnail: { type: String, default: '' },
    accent: { type: String, enum: ['indigo', 'violet', 'gold'], default: 'indigo' },

    // Commerce
    price: { type: Number, required: true, default: 2500 },     // INR
    mrp: { type: Number, default: 0 },                          // strike-through price
    currency: { type: String, default: 'INR' },

    // Delivery
    mode: { type: String, enum: ['live', 'self-paced', 'hybrid', 'physical'], default: 'live' },
    durationWeeks: { type: Number, default: 8 },
    sessionsPerWeek: { type: Number, default: 3 },
    sessionLengthMin: { type: Number, default: 90 },
    schedule: { type: String, default: '' },                    // e.g. "Mon/Wed/Fri · 8:00–9:30 PM IST"
    language: { type: String, default: 'English + Tamil' },
    seats: { type: Number, default: 40 },
    startDate: { type: Date },

    level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    tags: [{ type: String }],
    /** Which SSAT subskills this course actually teaches — drives journey matching. */
    ssatSubskills: [{ type: String }],
    outcomes: [{ type: String }],       // "What you'll be able to do"
    tools: [{ type: String }],          // tech/tools covered
    projects: [{ type: String }],       // portfolio projects
    includes: [{ type: String }],       // what's included in the fee
    prerequisites: [{ type: String }],
    faqs: [{ q: String, a: String }],

    instructor: {
      name: { type: String, default: '' },
      role: { type: String, default: '' },
      bio: { type: String, default: '' },
      initials: { type: String, default: '' },
    },

    modules: [moduleSchema],
    recordingSections: [recSectionSchema],
    totalLessons: { type: Number, default: 0 },
    rating: { type: Number, default: 4.8 },
    learnersCount: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },

    // ── v2 course config (admin decides per course) ──
    // Whether the workspace surfaces these to students. Actual content links in
    // once the recordings / test packages exist (later phases).
    recordingsAvailable: { type: Boolean, default: false },
    testsAvailable: { type: Boolean, default: false },
    codingAvailable: { type: Boolean, default: false },

    /**
     * What a purchase of THIS course bundles in — the umbrella. Buying the course
     * grants every kind ticked here in one payment (no separate à-la-carte needed).
     * Defaults to everything included; untick a kind to sell it only as a product.
     */
    included: {
      recordings: { type: Boolean, default: true },
      learning: { type: Boolean, default: true },
      mock_tests: { type: Boolean, default: true },
      live_cohort: { type: Boolean, default: true },
    },
    // If on, students may submit a project (PDF / images / a link) in the workspace.
    allowProjectUpload: { type: Boolean, default: false },
  },
  { timestamps: true }
);

courseSchema.pre('save', function (next) {
  this.totalLessons = this.modules.reduce((n, m) => n + m.lessons.length, 0);
  next();
});

// Virtual: total live hours
courseSchema.virtual('totalHours').get(function () {
  return Math.round((this.durationWeeks * this.sessionsPerWeek * this.sessionLengthMin) / 60);
});
courseSchema.set('toJSON', { virtuals: true });

export const Course = mongoose.model('Course', courseSchema);
