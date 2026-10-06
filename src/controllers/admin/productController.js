import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Product, ATOMIC_KINDS } from '../../models/Product.js';
import { Course } from '../../models/Course.js';
import { Upload } from '../../models/Upload.js';
import { signedDownload } from '../../services/storage/index.js';

async function thumbUrl(id) {
  if (!id) return '';
  const up = await Upload.findById(id);
  if (!up) return '';
  try { return await signedDownload(up, { inline: true, expiresIn: 3600 }); } catch { return ''; }
}

const shape = async (p) => ({
  id: p._id, title: p.title, slug: p.slug, description: p.description,
  kind: p.kind, course: p.course, price: p.price, mrp: p.mrp, currency: p.currency,
  expiresInDays: p.expiresInDays, bundleItems: p.bundleItems || [],
  isPublished: p.isPublished, thumbnail: p.thumbnail, thumbnailUrl: await thumbUrl(p.thumbnail),
  createdAt: p.createdAt,
});

export const list = asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.kind) q.kind = req.query.kind;
  if (req.query.course) q.course = req.query.course;
  const products = await Product.find(q).sort('-createdAt')
    .populate('course', 'title')
    .populate('bundleItems', 'title kind price');
  const items = await Promise.all(products.map(async (p) => ({
    ...(await shape(p)),
    courseTitle: p.course?.title || '',
    bundleItemsDetail: (p.bundleItems || []).map((b) => ({ id: b._id, title: b.title, kind: b.kind, price: b.price })),
  })));
  ok(res, { products: items });
});

export const create = asyncHandler(async (req, res) => {
  const body = sanitize(req.body);
  if (!body.title || !body.kind) throw ApiError.badRequest('Title and kind are required.');
  if (body.kind !== 'bundle' && !body.course) throw ApiError.badRequest('An atomic product needs a course.');
  if (body.kind === 'bundle' && !(body.bundleItems || []).length) throw ApiError.badRequest('A bundle needs at least one item.');
  if (body.course) { if (!(await Course.exists({ _id: body.course }))) throw ApiError.notFound('Course not found.'); }
  const p = await Product.create(body);
  ok(res, { product: await shape(p) }, 'Product created', 201);
});

export const update = asyncHandler(async (req, res) => {
  const body = sanitize(req.body);
  const p = await Product.findByIdAndUpdate(req.params.id, { $set: body }, { new: true, runValidators: true });
  if (!p) throw ApiError.notFound('Product not found.');
  ok(res, { product: await shape(p) }, 'Product updated');
});

export const remove = asyncHandler(async (req, res) => {
  // Guard: don't orphan a bundle that references this product.
  const usedIn = await Product.findOne({ bundleItems: req.params.id }).select('title');
  if (usedIn) throw ApiError.badRequest(`Remove it from the bundle "${usedIn.title}" first.`);
  const p = await Product.findByIdAndDelete(req.params.id);
  if (!p) throw ApiError.notFound('Product not found.');
  ok(res, { deleted: true }, 'Product removed');
});

export const setPublished = asyncHandler(async (req, res) => {
  const p = await Product.findByIdAndUpdate(req.params.id, { $set: { isPublished: !!req.body.isPublished } }, { new: true });
  if (!p) throw ApiError.notFound('Product not found.');
  ok(res, { product: await shape(p) }, p.isPublished ? 'Published' : 'Unpublished');
});

// Only accept known fields.
function sanitize(b) {
  const out = {};
  for (const k of ['title', 'slug', 'description', 'kind', 'course', 'price', 'mrp', 'currency', 'expiresInDays', 'bundleItems', 'isPublished', 'thumbnail']) {
    if (b[k] !== undefined) out[k] = b[k];
  }
  if (out.kind === 'bundle') { out.course = null; out.expiresInDays = null; }
  else out.bundleItems = [];
  if (out.expiresInDays === '' || out.expiresInDays === 0) out.expiresInDays = null;
  return out;
}
