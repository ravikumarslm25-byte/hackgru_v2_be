import mongoose from 'mongoose';

/**
 * A Product is anything with a price a student can buy — the catalogue unit.
 * Four "atomic" kinds map 1:1 to an access kind for a course (recordings,
 * learning, mock_tests, live_cohort); a fifth kind, 'bundle', grants the union
 * of several other products at a combined price.
 *
 * What a product unlocks is expressed as `grants` (resolved via resolveGrants()):
 *   - atomic product → one grant: { kind, course, expiresInDays }
 *   - bundle        → the union of its bundleItems' grants
 * Fulfilment (on paid order) turns each grant into an Entitlement, stamping
 * expiresAt = now + expiresInDays (null = lifetime). This is the per-product
 * expiry the architecture calls for: the Product declares it, fulfilment stamps it.
 */
const ATOMIC = ['recordings', 'learning', 'mock_tests', 'live_cohort'];

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true, index: true },
    description: { type: String, default: '' },
    thumbnail: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },

    kind: { type: String, enum: [...ATOMIC, 'bundle'], required: true },
    // The course an atomic product belongs to. Null for a cross-course bundle.
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null, index: true },

    price: { type: Number, required: true, min: 0 },   // INR
    mrp: { type: Number, default: 0, min: 0 },          // strike-through "list" price (0 = none)
    currency: { type: String, default: 'INR' },

    // Atomic-product access expiry. null = lifetime.
    expiresInDays: { type: Number, default: null },

    // Bundle only: the products this bundle includes.
    bundleItems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],

    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

productSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  next();
});

/**
 * Resolve what buying this product grants, as a flat list of
 * { kind, course, expiresInDays }. Bundles expand one level into their items
 * (items are atomic in practice; if an item is itself a bundle we recurse).
 */
productSchema.methods.resolveGrants = async function (depth = 0) {
  if (this.kind !== 'bundle') {
    return [{ kind: this.kind, course: this.course, expiresInDays: this.expiresInDays }];
  }
  if (depth > 3 || !this.bundleItems?.length) return [];
  const items = await this.model('Product').find({ _id: { $in: this.bundleItems } });
  const out = [];
  for (const it of items) out.push(...(await it.resolveGrants(depth + 1)));
  // de-dupe by kind+course (keep the longest/lifetime expiry)
  const map = new Map();
  for (const g of out) {
    const key = `${g.kind}:${g.course || ''}`;
    const prev = map.get(key);
    if (!prev) { map.set(key, g); continue; }
    // null expiry (lifetime) wins; else the larger day count wins
    if (prev.expiresInDays == null || g.expiresInDays == null) map.set(key, { ...g, expiresInDays: null });
    else map.set(key, { ...g, expiresInDays: Math.max(prev.expiresInDays, g.expiresInDays) });
  }
  return [...map.values()];
};

export const Product = mongoose.model('Product', productSchema);
export const ATOMIC_KINDS = ATOMIC;
