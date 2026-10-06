import mongoose from 'mongoose';

const enrollmentSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    /**
     * The cohort this enrolment belongs to. Set for link registrations; null for
     * anyone who bought the course on the public website.
     *
     * It lives on the ENROLMENT, not the User, because one student can hold
     * several courses — one through their college's link, another bought
     * privately — and each belongs to a different (or no) batch.
     */
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    /**
     * PAYMENT IS A SEPARATE FACT FROM ENROLMENT.
     *
     * An enrolment means "this student registered for this course". `paid` means
     * "they can open it". Conflating the two is why an abandoned payment used to
     * leave a student registered with their college but absent from the batch —
     * they had nothing to come back to.
     *
     * Link registration creates the enrolment immediately with paid:false, so the
     * student appears in the batch straight away and can finish paying later.
     */
    paid: { type: Boolean, default: false, index: true },
    /** Access granted without payment (college-sponsored/free link). Suppresses the
     *  "payment pending" prompts; access itself rides granted entitlements. */
    sponsored: { type: Boolean, default: false },
    paidAt: { type: Date },
    /** Which link they came through — lets a resumed payment find its seat. */
    registrationLink: { type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationLink', default: null },

    progress: { type: Number, min: 0, max: 100, default: 0 },
    completedLessons: [{ type: String }],
    status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active' },
    lastAccessed: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

enrollmentSchema.index({ student: 1, course: 1 }, { unique: true });

export const Enrollment = mongoose.model('Enrollment', enrollmentSchema);
