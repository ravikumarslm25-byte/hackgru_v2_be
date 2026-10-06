import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Product } from '../models/Product.js';
import { Upload } from '../models/Upload.js';
import { signedDownload } from '../services/storage/index.js';
import { productOwned } from '../services/commerce/fulfilment.js';

const KIND_LABEL = { recordings: 'Recorded lessons', learning: 'Learning + coding', mock_tests: 'Mock tests', live_cohort: 'Live cohort' };

async function thumbUrl(id) {
  if (!id) return '';
  const up = await Upload.findById(id);
  if (!up) return '';
  try { return await signedDownload(up, { inline: true, expiresIn: 3600 }); } catch { return ''; }
}

async function unlocks(product) {
  const grants = await product.resolveGrants();
  const out = [];
  for (const g of grants) {
    const label = KIND_LABEL[g.kind] || g.kind;
    out.push({ kind: g.kind, label, expiresInDays: g.expiresInDays });
  }
  return out;
}

async function view(product, studentId) {
  const owned = studentId ? await productOwned(studentId, product) : false;
  const c = product.course;
  return {
    id: product._id, slug: product.slug, title: product.title, description: product.description,
    kind: product.kind, price: product.price, mrp: product.mrp, currency: product.currency,
    expiresInDays: product.expiresInDays,
    course: c ? { id: c._id, title: c.title, slug: c.slug } : null,
    category: c?.category ? { id: c.category._id, name: c.category.name } : null,
    subcategory: c?.subcategory ? { id: c.subcategory._id, name: c.subcategory.name } : null,
    thumbnailUrl: await thumbUrl(product.thumbnail),
    unlocks: await unlocks(product), owned,
  };
}

const COURSE_POP = { path: 'course', select: 'title slug category subcategory',
  populate: [{ path: 'category', select: 'name' }, { path: 'subcategory', select: 'name' }] };

// GET /api/store/products  (optionally ?category= / ?course=)
export const listProducts = asyncHandler(async (req, res) => {
  const q = { isPublished: true };
  if (req.query.course) q.course = req.query.course;
  let products = await Product.find(q).populate(COURSE_POP).sort('-createdAt');
  if (req.query.category) products = products.filter((p) => String(p.course?.category?._id) === String(req.query.category));
  const studentId = req.user?._id;
  const items = [];
  for (const p of products) items.push(await view(p, studentId));
  ok(res, { products: items });
});

// GET /api/store/products/:slug
export const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isPublished: true }).populate(COURSE_POP);
  if (!product) throw ApiError.notFound('Product not found.');
  const detail = await view(product, req.user?._id);
  if (product.kind === 'bundle' && product.bundleItems?.length) {
    const items = await Product.find({ _id: { $in: product.bundleItems } }).populate('course', 'title slug');
    detail.bundleItems = [];
    for (const it of items) detail.bundleItems.push({ id: it._id, title: it.title, kind: it.kind, courseTitle: it.course?.title || '' });
  }
  ok(res, { product: detail });
});
