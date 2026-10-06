import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { getRazorpay, isPaymentsEnabled, verifySignature } from '../config/razorpay.js';
import { Cart } from '../models/Cart.js';
import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { productOwned, fulfilCartOrder } from '../services/commerce/fulfilment.js';

// POST /api/checkout/order — build a Razorpay order from the student's cart.
export const createOrder = asyncHandler(async (req, res) => {
  if (!isPaymentsEnabled()) throw new ApiError(503, 'Payments are not configured.');
  const cart = await Cart.findOne({ student: req.user._id });
  if (!cart || cart.products.length === 0) throw ApiError.badRequest('Your cart is empty.');

  const products = await Product.find({ _id: { $in: cart.products }, isPublished: true });
  // Drop anything already owned; price the rest SERVER-SIDE (never trust the client).
  const buyable = [];
  for (const p of products) if (!(await productOwned(req.user._id, p))) buyable.push(p);
  if (buyable.length === 0) throw ApiError.badRequest('Nothing to pay for — you already own these.');

  const amount = buyable.reduce((n, p) => n + p.price, 0);
  if (amount <= 0) throw ApiError.badRequest('Cart total must be greater than zero.');

  const razorpay = await getRazorpay();
  const receipt = `cart_${Date.now()}_${String(req.user._id).slice(-6)}`;
  const rzpOrder = await razorpay.orders.create({
    amount: amount * 100, currency: 'INR', receipt,
    notes: { studentId: String(req.user._id), kind: 'cart', items: String(buyable.length) },
  });

  const order = await Order.create({
    student: req.user._id, type: 'cart',
    items: buyable.map((p) => ({ product: p._id, title: p.title, kind: p.kind, price: p.price })),
    amount, currency: 'INR', razorpayOrderId: rzpOrder.id, receipt, status: 'created',
  });

  ok(res, {
    orderId: order._id,
    razorpay: { razorpayOrderId: rzpOrder.id, amount: rzpOrder.amount, currency: rzpOrder.currency, keyId: env.razorpayKeyId },
    summary: { amount, items: order.items.map((i) => ({ title: i.title, price: i.price })) },
  }, 'Order created', 201);
});

// POST /api/checkout/verify  { razorpayOrderId, razorpayPaymentId, razorpaySignature }
export const verify = asyncHandler(async (req, res) => {
  const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) throw ApiError.badRequest('Missing payment fields.');

  const order = await Order.findOne({ razorpayOrderId, student: req.user._id, type: 'cart' });
  if (!order) throw ApiError.notFound('Order not found.');

  if (order.status !== 'paid') {
    const valid = verifySignature({ orderId: razorpayOrderId, paymentId: razorpayPaymentId, signature: razorpaySignature });
    if (!valid) { order.status = 'failed'; await order.save(); throw ApiError.badRequest('Payment verification failed.'); }
    order.status = 'paid';
    order.razorpayPaymentId = razorpayPaymentId;
    order.razorpaySignature = razorpaySignature;
    try {
      const rz = await getRazorpay();
      const p = await rz.payments.fetch(razorpayPaymentId);
      order.method = p?.method || '';
      order.methodDetail = p?.method === 'upi' ? (p.vpa || 'UPI')
        : p?.method === 'card' ? [p.card?.network, p.card?.last4 && `•••• ${p.card.last4}`].filter(Boolean).join(' ')
        : p?.method === 'netbanking' ? (p.bank || 'Net banking')
        : p?.method === 'wallet' ? (p.wallet || 'Wallet') : '';
    } catch { /* best-effort */ }
    await order.save();
  }

  const granted = await fulfilCartOrder(order);
  // Empty the cart of the items just purchased.
  const cart = await Cart.findOne({ student: req.user._id });
  if (cart) {
    const boughtIds = new Set(order.items.map((i) => String(i.product)));
    cart.products = cart.products.filter((x) => !boughtIds.has(String(x)));
    await cart.save();
  }
  ok(res, { order: { id: order._id, amount: order.amount, items: order.items }, granted }, 'Payment successful — access unlocked!');
});

// GET /api/checkout/orders — this student's product orders
export const myOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ student: req.user._id, type: 'cart' }).sort('-createdAt').lean();
  ok(res, { orders: orders.map((o) => ({ id: o._id, amount: o.amount, status: o.status,
    items: o.items, createdAt: o.createdAt, method: o.method, methodDetail: o.methodDetail })) });
});
