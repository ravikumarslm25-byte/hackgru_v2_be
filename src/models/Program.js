import mongoose from 'mongoose';

const programSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    category: {
      type: String, enum: ['technical', 'non-technical', 'company-specific'],
      required: true,
    },
    tagline: { type: String, default: '' },
    description: { type: String, default: '' },
    technologies: [{ type: String }],
    durationWeeks: { type: Number, default: 12 },
    level: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
    image: { type: String, default: '' },
    highlights: [{ type: String }],
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Program = mongoose.model('Program', programSchema);
