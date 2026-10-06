import { Product } from '../../models/Product.js';
import { Enrollment } from '../../models/Enrollment.js';
import { grantEntitlement, can } from '../access/entitlements.js';

const DAY = 24 * 60 * 60 * 1000;

/** Does the student already have access to EVERY grant of this product (via any door)? */
export async function productOwned(studentId, product) {
  const grants = await product.resolveGrants();
  if (grants.length === 0) return false;
  for (const g of grants) {
    if (!g.course) return false;
    if (!(await can(studentId, g.kind, g.course))) return false;
  }
  return true;
}

/**
 * Turn a paid cart Order into entitlements. Idempotent: guarded by order.fulfilledAt
 * and by grantEntitlement being idempotent per (student, kind, course).
 * Returns the list of granted { kind, course } for the confirmation screen.
 */
export async function fulfilCartOrder(order) {
  if (order.fulfilledAt) return [];
  const productIds = (order.items || []).map((i) => i.product).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } });
  const granted = [];
  const courses = new Set();
  for (const product of products) {
    const grants = await product.resolveGrants();
    for (const g of grants) {
      if (!g.course) continue;
      const expiresAt = g.expiresInDays ? new Date(Date.now() + g.expiresInDays * DAY) : null;
      await grantEntitlement({
        student: order.student, kind: g.kind, course: g.course,
        source: 'purchase', order: order._id, product: product._id, expiresAt,
      });
      granted.push({ kind: g.kind, course: g.course });
      courses.add(String(g.course));
    }
  }

  // A purchase must make the course reachable in "My Courses" and pass the
  // enrolled-in-course gate. Entitlements grant the *content* access; an
  // enrolment makes the course *appear*. Create one per purchased course
  // (idempotent via the unique student+course index).
  for (const courseId of courses) {
    const existing = await Enrollment.findOne({ student: order.student, course: courseId });
    if (!existing) {
      await Enrollment.create({ student: order.student, course: courseId, paid: true, paidAt: new Date() });
    } else if (!existing.paid) {
      existing.paid = true; existing.paidAt = existing.paidAt || new Date(); await existing.save();
    }
  }

  order.fulfilledAt = new Date();
  await order.save();
  return granted;
}
