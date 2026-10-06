import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DEFAULT_SPOC_PERMISSIONS } from '../services/access/permissions.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true },
    email: {
      type: String, required: [true, 'Email is required'], unique: true,
      lowercase: true, trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: { type: String, required: true, minlength: 6, select: false },
    phone: { type: String, trim: true },
    role: { type: String, enum: ['student', 'instructor', 'spoc', 'admin', 'staff'], default: 'student', index: true },
    /** For role 'staff' — their dynamic role carrying permissions. */
    staffRole: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
    designation: { type: String, default: '' },
    avatar: { type: String, default: '' },
    /** S3 upload holding their photo. See services/storage. */
    photoUpload: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', 'prefer-not-to-say', ''], default: '' },
    address: {
      line1: { type: String, default: '' }, city: { type: String, default: '' },
      state: { type: String, default: '' }, pincode: { type: String, default: '' },
    },
    links: {
      github: { type: String, default: '' }, linkedin: { type: String, default: '' },
      portfolio: { type: String, default: '' },
    },
    track: { type: String, enum: ['technical', 'non-technical', 'company-specific', ''], default: '' },
    /** Free text the student typed on the public site. Informational only —
     *  it is NOT a link to a College and gives no college any visibility. */
    institution: { type: String, default: '' },
    bio: { type: String, default: '' },

    /* ─────────────── College affiliation ───────────────
     * THIS IS THE VISIBILITY BOUNDARY. `college` is set ONLY when a student
     * registers through a special link (or by an explicit admin action). A
     * student who signs up on the website and types "Anna University" into
     * `institution` above still has college = null, and is therefore invisible
     * to every college portal — not because a query filters them out, but
     * because there is no edge to traverse. Nothing to forget.
     *
     * See services/access/collegeScope.js.
     */
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', default: null, index: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null, index: true },
    registerNumber: { type: String, default: '', trim: true },   // college roll number
    year: { type: String, default: '' },                          // '3', 'final', 'grad'

    registrationSource: {
      type: String, enum: ['website', 'link', 'admin', 'bulk'], default: 'website', index: true,
    },
    registrationLink: { type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationLink', default: null },

    /* ─────────────── SPOC access (role: 'spoc' only) ─────────────── */
    spocAccess: {
      college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', default: null },
      /** Empty = every department in the college. */
      departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
      /** Empty = every batch within the departments above. */
      batches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Batch' }],
      can: { type: [String], default: () => [...DEFAULT_SPOC_PERMISSIONS] },
      designation: { type: String, default: '' },
    },

    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },

    /* ─────────────── Email verification (OTP) ───────────────
     * A new account is unverified until the student enters the code emailed to
     * them. Login and payment are both gated on emailVerified. The OTP is stored
     * hashed (never plaintext); the raw code only ever lives in the email.
     */
    emailVerified: { type: Boolean, default: false, index: true },
    emailOtpHash: { type: String, select: false, default: null },
    emailOtpExpires: { type: Date, select: false, default: null },
    emailOtpAttempts: { type: Number, select: false, default: 0 },
    emailOtpLastSentAt: { type: Date, select: false, default: null },
    emailVerifiedAt: { type: Date, default: null },

    /* Password reset (OTP). Separate from email-verification OTP so the two
     * flows can't clobber each other. Stored hashed, same policy. */
    resetOtpHash: { type: String, select: false, default: null },
    resetOtpExpires: { type: Date, select: false, default: null },
    resetOtpAttempts: { type: Number, select: false, default: 0 },
    resetOtpLastSentAt: { type: Date, select: false, default: null },
  },
  { timestamps: true }
);

// Hash password on save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = function (entered) {
  return bcrypt.compare(entered, this.password);
};

/**
 * How complete is this profile, and what's missing?
 *
 * Weighted by what it's actually FOR — a photo and a phone number matter to a
 * placement officer; a pincode doesn't. Returns the gaps so the UI can say what
 * to do next instead of showing a number and a shrug.
 *
 * Different weights per role: a SPOC has no register number or resume links.
 */
userSchema.methods.profileCompleteness = function () {
  const common = [
    ['Your name', 10, () => Boolean(this.name?.trim())],
    ['A phone number', 12, () => Boolean(this.phone?.trim())],
    ['A profile photo', 12, () => Boolean(this.photoUpload || this.avatar)],
  ];
  const byRole = {
    student: [
      ['Your college register number', 12, () => Boolean(this.registerNumber?.trim())],
      ['Year of study', 8, () => Boolean(this.year)],
      ['A short bio', 10, () => (this.bio || '').trim().length >= 30],
      ['Date of birth', 8, () => Boolean(this.dateOfBirth)],
      ['Your city', 8, () => Boolean(this.address?.city?.trim())],
      ['A GitHub or LinkedIn link', 20, () =>
        Boolean(this.links?.github || this.links?.linkedin || this.links?.portfolio)],
    ],
    spoc: [
      ['Your designation', 20, () => Boolean(this.spocAccess?.designation?.trim())],
      ['A short bio', 10, () => (this.bio || '').trim().length >= 30],
      ['Your city', 10, () => Boolean(this.address?.city?.trim())],
    ],
  };
  const checks = [...common, ...(byRole[this.role] || byRole.spoc)];
  const total = checks.reduce((n, c) => n + c[1], 0);

  let score = 0;
  const missing = [];
  for (const [label, weight, test] of checks) {
    if (test()) score += weight; else missing.push({ label, weight });
  }
  // Normalise: the role lists don't add to 100 on their own.
  return { percent: Math.round((score / total) * 100), missing };
};

export const User = mongoose.model('User', userSchema);
