import mongoose from 'mongoose';

/**
 * Public catalogue taxonomy: Category → Subcategory.
 * This is the STOREFRONT taxonomy students see (e.g. "Web Development" →
 * "React", "Data Science" → "Machine Learning"). It's distinct from the
 * internal Stream → Track (which is admin-only). Every self-paced content type
 * — recorded courses, test packages, coding tracks — files under a
 * category/subcategory so the store can group and filter them.
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true, index: true },
    description: { type: String, default: '' },
    icon: { type: String, default: '' },       // lucide icon name (optional)
    color: { type: String, default: '#61429f' },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
categorySchema.pre('validate', function (next) {
  if (!this.slug && this.name) this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  next();
});
export const Category = mongoose.model('Category', categorySchema);

const subcategorySchema = new mongoose.Schema(
  {
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);
subcategorySchema.pre('validate', function (next) {
  if (!this.slug && this.name) this.slug = this.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  next();
});
export const Subcategory = mongoose.model('Subcategory', subcategorySchema);
