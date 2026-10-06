import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Category, Subcategory } from '../../models/Category.js';
import { Course } from '../../models/Course.js';

/** GET /api/admin/categories — categories with their subcategories nested. */
export const list = asyncHandler(async (_req, res) => {
  const [cats, subs] = await Promise.all([
    Category.find().sort('order name').lean(),
    Subcategory.find().sort('order name').lean(),
  ]);
  const byCat = {};
  for (const s of subs) (byCat[s.category] ||= []).push({ id: s._id, name: s.name, slug: s.slug, order: s.order, isActive: s.isActive });
  ok(res, { categories: cats.map((c) => ({
    id: c._id, name: c.name, slug: c.slug, description: c.description, icon: c.icon, color: c.color,
    order: c.order, isActive: c.isActive, subcategories: byCat[c._id] || [],
  })) });
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, icon, color, order, isActive } = req.body;
  if (!name) throw ApiError.badRequest('Category name is required.');
  const c = await Category.create({ name, description, icon, color, order, isActive });
  ok(res, { category: c }, 'Category created', 201);
});
export const updateCategory = asyncHandler(async (req, res) => {
  const c = await Category.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!c) throw ApiError.notFound('Category not found.');
  ok(res, { category: c }, 'Category updated');
});
export const deleteCategory = asyncHandler(async (req, res) => {
  const inUse = await Course.exists({ category: req.params.id });
  if (inUse) throw ApiError.badRequest('Some courses use this category. Reassign them first.');
  await Subcategory.deleteMany({ category: req.params.id });
  const c = await Category.findByIdAndDelete(req.params.id);
  if (!c) throw ApiError.notFound('Category not found.');
  ok(res, { deleted: true }, 'Category removed');
});

export const createSubcategory = asyncHandler(async (req, res) => {
  const { category, name, order, isActive } = req.body;
  if (!category || !name) throw ApiError.badRequest('Category and name are required.');
  if (!(await Category.exists({ _id: category }))) throw ApiError.notFound('Parent category not found.');
  const s = await Subcategory.create({ category, name, order, isActive });
  ok(res, { subcategory: s }, 'Subcategory created', 201);
});
export const updateSubcategory = asyncHandler(async (req, res) => {
  const s = await Subcategory.findByIdAndUpdate(req.params.id, { $set: req.body }, { new: true });
  if (!s) throw ApiError.notFound('Subcategory not found.');
  ok(res, { subcategory: s }, 'Subcategory updated');
});
export const deleteSubcategory = asyncHandler(async (req, res) => {
  const inUse = await Course.exists({ subcategory: req.params.id });
  if (inUse) throw ApiError.badRequest('Some courses use this subcategory. Reassign them first.');
  const s = await Subcategory.findByIdAndDelete(req.params.id);
  if (!s) throw ApiError.notFound('Subcategory not found.');
  ok(res, { deleted: true }, 'Subcategory removed');
});
