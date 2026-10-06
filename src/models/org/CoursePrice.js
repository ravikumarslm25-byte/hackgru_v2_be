import mongoose from 'mongoose';

/**
 * A negotiated price for one course at one college.
 *
 * Set once here, and every registration link for that college+course inherits
 * it. A link can still override for a one-off (RegistrationLink.priceOverride),
 * so the resolution order is:
 *
 *   link.priceOverride  →  CoursePrice  →  course.price
 *
 * This is exactly why `payments:view` is off by default for SPOCs — it would
 * show one college what another negotiated.
 */
const coursePriceSchema = new mongoose.Schema(
  {
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    college: { type: mongoose.Schema.Types.ObjectId, ref: 'College', required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    note: { type: String, default: '' },     // "Signed 12 Jul, 60-seat commitment"
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One price per course per college.
coursePriceSchema.index({ course: 1, college: 1 }, { unique: true });

/** The single place that decides what a college pays. */
coursePriceSchema.statics.resolve = async function ({ courseId, collegeId, coursePrice, linkOverride }) {
  if (linkOverride != null) return { price: linkOverride, source: 'link' };
  if (collegeId) {
    const row = await this.findOne({ course: courseId, college: collegeId }).lean();
    if (row) return { price: row.price, source: 'college' };
  }
  return { price: coursePrice, source: 'list' };
};

export const CoursePrice = mongoose.model('CoursePrice', coursePriceSchema);
