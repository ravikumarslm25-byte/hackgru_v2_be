import mongoose from 'mongoose';

/**
 * A student's resume.
 *
 * THE ARCHITECTURE: content and presentation are completely separate. This model
 * knows nothing about templates beyond a name. Every template is a pure render
 * function of this shape, so switching template is instant, lossless, and adding
 * an 11th costs one file — no migration, no data change.
 *
 * Get this wrong (template-specific fields, rendered HTML in the DB) and every
 * new template becomes a schema change.
 */

const bullets = { type: [String], default: [] };
const dateish = { type: String, default: '' };   // 'Jun 2024' — not a Date; resumes are vague on purpose

const linkSchema = new mongoose.Schema({
  label: { type: String, default: '' },   // 'GitHub'
  url: { type: String, default: '' },
}, { _id: false });

const resumeSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    template: { type: String, default: 'modern', index: true },
    accent: { type: String, default: 'indigo' },

    basics: {
      fullName: { type: String, default: '' },
      headline: { type: String, default: '' },      // 'Final-year CSE · React developer'
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      location: { type: String, default: '' },
      /**
       * Photo source:
       *   'profile' — use whatever is on their profile (the default, and it
       *               follows automatically when they change it there)
       *   'custom'  — a different upload, just for the résumé
       *   'none'    — deliberately no photo
       *
       * Many recruiters — and every ATS — prefer no photo. Indian campus
       * placement usually expects one. So it's a choice, not a default.
       */
      photoMode: { type: String, enum: ['profile', 'custom', 'none'], default: 'profile' },
      photoUpload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
      summary: { type: String, default: '' },
      links: { type: [linkSchema], default: [] },
    },

    /** Grouped, so a template can render "Languages: Java, Python" style rows. */
    skills: {
      type: [new mongoose.Schema({
        category: { type: String, default: '' },     // 'Languages'
        items: { type: [String], default: [] },
      }, { _id: false })],
      default: [],
    },

    experience: {
      type: [new mongoose.Schema({
        role: String, company: String, location: String,
        from: dateish, to: dateish, current: { type: Boolean, default: false },
        bullets,
      })],
      default: [],
    },

    education: {
      type: [new mongoose.Schema({
        degree: String, institution: String, location: String,
        from: dateish, to: dateish,
        score: { type: String, default: '' },        // 'CGPA 8.4' or '86%' — a string on purpose
        notes: { type: String, default: '' },
      })],
      default: [],
    },

    projects: {
      type: [new mongoose.Schema({
        title: String, role: { type: String, default: '' },
        link: { type: String, default: '' },
        from: dateish, to: dateish,
        tech: { type: [String], default: [] },
        bullets,
      })],
      default: [],
    },

    certifications: {
      type: [new mongoose.Schema({
        name: String, issuer: { type: String, default: '' },
        date: dateish, credentialId: { type: String, default: '' }, url: { type: String, default: '' },
      })],
      default: [],
    },

    achievements: {
      type: [new mongoose.Schema({
        title: String, date: dateish, detail: { type: String, default: '' },
      })],
      default: [],
    },

    /** Which sections to render, and in what order. */
    sectionOrder: {
      type: [String],
      default: ['summary', 'skills', 'experience', 'projects', 'education', 'certifications', 'achievements'],
    },

    /* ── usage, for the admin's analytics ── */
    stats: {
      views: { type: Number, default: 0 },
      downloads: { type: Number, default: 0 },
      templateSwitches: { type: Number, default: 0 },
      lastOpenedAt: Date,
      lastDownloadedAt: Date,
    },
    /** Every template they've tried — shows which ones actually get used. */
    templatesUsed: { type: [String], default: [] },
  },
  { timestamps: true }
);

/**
 * How complete is it, and what's missing?
 *
 * Weighted by what a recruiter actually looks for, not by field count — a
 * summary and one project matter more than a certifications list. Returns the
 * gaps too, so the UI can tell them what to do next instead of just scolding
 * them with a number.
 */
resumeSchema.methods.completeness = function () {
  const checks = [
    ['Your name', 12, () => Boolean(this.basics?.fullName?.trim())],
    ['A headline', 8, () => Boolean(this.basics?.headline?.trim())],
    ['Email and phone', 10, () => Boolean(this.basics?.email && this.basics?.phone)],
    ['A short summary', 12, () => (this.basics?.summary || '').trim().length >= 40],
    ['At least 3 skills', 15, () => this.skills.reduce((n, s) => n + s.items.length, 0) >= 3],
    ['At least one project', 18, () => this.projects.length > 0 && this.projects.some((p) => p.bullets.length)],
    ['Your education', 15, () => this.education.length > 0],
    ['A link (GitHub / LinkedIn)', 5, () => this.basics?.links?.some((l) => l.url)],
    ['Experience or a certification', 5, () => this.experience.length > 0 || this.certifications.length > 0],
  ];
  let score = 0;
  const missing = [];
  for (const [label, weight, test] of checks) {
    if (test()) score += weight; else missing.push({ label, weight });
  }
  return { percent: Math.min(100, score), missing };
};

resumeSchema.index({ updatedAt: -1 });

export const Resume = mongoose.model('Resume', resumeSchema);
