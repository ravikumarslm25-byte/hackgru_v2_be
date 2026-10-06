import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Cart } from '../models/Cart.js';
import { Product } from '../models/Product.js';
import { productOwned } from '../services/commerce/fulfilment.js';

async function loadCart(studentId) {
  let cart = await Cart.findOne({ student: studentId });
  if (!cart) cart = await Cart.create({ student: studentId, products: [] });
  return cart;
}

async function cartView(cart, studentId) {
  const products = await Product.find({ _id: { $in: cart.products }, isPublished: true }).populate('course', 'title slug');
  const items = [];
  let total = 0, mrpTotal = 0;
  for (const p of products) {
    const owned = await productOwned(studentId, p);
    items.push({ id: p._id, slug: p.slug, title: p.title, kind: p.kind, price: p.price, mrp: p.mrp,
      courseTitle: p.course?.title || '', owned });
    if (!owned) { total += p.price; mrpTotal += (p.mrp || p.price); }
  }
  return { items, total, mrpTotal, count: items.length };
}

// GET /api/cart
export const getCart = asyncHandler(async (req, res) => {
  const cart = await loadCart(req.user._id);
  ok(res, await cartView(cart, req.user._id));
});

// POST /api/cart  { productId }
export const addToCart = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  const product = await Product.findOne({ _id: productId, isPublished: true });
  if (!product) throw ApiError.notFound('Product not found.');
  if (await productOwned(req.user._id, product)) throw ApiError.badRequest('You already have access to this.');
  const cart = await loadCart(req.user._id);
  if (!cart.products.some((x) => String(x) === String(productId))) { cart.products.push(productId); await cart.save(); }
  ok(res, await cartView(cart, req.user._id), 'Added to cart');
});

// DELETE /api/cart/:productId
export const removeFromCart = asyncHandler(async (req, res) => {
  const cart = await loadCart(req.user._id);
  cart.products = cart.products.filter((x) => String(x) !== String(req.params.productId));
  await cart.save();
  ok(res, await cartView(cart, req.user._id), 'Removed');
});

// DELETE /api/cart
export const clearCart = asyncHandler(async (req, res) => {
  const cart = await loadCart(req.user._id);
  cart.products = []; await cart.save();
  ok(res, await cartView(cart, req.user._id), 'Cart cleared');
});
