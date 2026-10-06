import mongoose from 'mongoose';

/** One cart per student — a set of products awaiting checkout. */
const cartSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  },
  { timestamps: true }
);
export const Cart = mongoose.model('Cart', cartSchema);
