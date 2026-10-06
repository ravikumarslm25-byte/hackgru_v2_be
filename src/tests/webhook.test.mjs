/**
 * Razorpay webhook integration test.
 *
 * Covers the scenario this endpoint exists for: the student pays, their browser
 * dies before /payments/verify runs, and Razorpay calls us directly. Without the
 * webhook they are charged and never enrolled.
 *
 * Run: npm test
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_12345';

const root = path.resolve(import.meta.dirname, '..');
const url = (p) => pathToFileURL(path.join(root, p)).href;

/* ------------------------- in-memory fake models ------------------------- */
let orders = [];
let enrollments = [];

const mkOrder = (o) => ({
  _id: 'o1', student: 'u1', course: 'c1', amount: 2500,
  razorpayOrderId: 'order_TEST123', status: 'created',
  async save() { return this; }, ...o,
});

const FakeOrder = {
  async findOne(q) {
    return orders.find((o) =>
      (!q.razorpayOrderId || o.razorpayOrderId === q.razorpayOrderId) &&
      (!q.razorpayPaymentId || o.razorpayPaymentId === q.razorpayPaymentId)) || null;
  },
};
const FakeEnrollment = {
  async findOneAndUpdate(q, _u, _o) {
    let e = enrollments.find((x) => x.student === q.student && x.course === q.course);
    if (!e) { e = { _id: 'e' + (enrollments.length + 1), ...q, status: 'active' }; enrollments.push(e); }
    return e;
  },
  async updateOne(q, set) {
    const e = enrollments.find((x) => x.student === q.student && x.course === q.course);
    if (e) Object.assign(e, set);
  },
};

mock.module(url('models/Order.js'), { namedExports: { Order: FakeOrder } });
mock.module(url('models/Enrollment.js'), { namedExports: { Enrollment: FakeEnrollment } });

const { handleWebhook } = await import(url('controllers/webhookController.js'));

/* ------------------------------ harness ---------------------------------- */
const SECRET = 'whsec_test_12345';
const sign = (body) => crypto.createHmac('sha256', SECRET).update(body).digest('hex');

const mkRes = () => ({
  statusCode: 200, body: null,
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
});

async function fire(eventObj, { signature, mangle } = {}) {
  const bodyStr = JSON.stringify(eventObj);
  const raw = Buffer.from(mangle ? mangle(bodyStr) : bodyStr);
  const req = {
    body: raw,
    headers: { 'x-razorpay-signature': signature === undefined ? sign(bodyStr) : signature },
  };
  const res = mkRes();
  let err = null;
  await handleWebhook(req, res, (e) => { err = e; });
  return { res, err };
}

const capturedEvent = {
  event: 'payment.captured',
  payload: { payment: { entity: { id: 'pay_TEST123', order_id: 'order_TEST123', amount: 250000, status: 'captured' } } },
};

const reset = () => {
  orders = [mkOrder({})];
  enrollments = [];
};

/* -------------------------------- tests ---------------------------------- */

test('THE POINT: student pays, browser dies → webhook still enrols them', async () => {
  reset();
  // /payments/verify was never called — the browser closed.
  assert.equal(enrollments.length, 0);

  const { res, err } = await fire(capturedEvent);

  assert.equal(err, null);
  assert.equal(res.statusCode, 200);
  assert.equal(orders[0].status, 'paid', 'order not marked paid');
  assert.equal(orders[0].razorpayPaymentId, 'pay_TEST123');
  assert.equal(enrollments.length, 1, 'student was charged but NOT enrolled');
  assert.equal(enrollments[0].student, 'u1');
});

test('idempotent: Razorpay retries the same event without double-enrolling', async () => {
  reset();
  await fire(capturedEvent);
  await fire(capturedEvent);
  await fire(capturedEvent);
  assert.equal(enrollments.length, 1, `duplicate enrolments created: ${enrollments.length}`);
});

test('a forged signature is rejected', async () => {
  reset();
  const { err } = await fire(capturedEvent, { signature: 'f'.repeat(64) });
  assert.ok(err, 'forged webhook was accepted');
  assert.match(err.message, /signature/i);
  assert.equal(enrollments.length, 0, 'forged webhook granted access');
});

test('a tampered body is rejected (proves the raw body survives express.json)', async () => {
  reset();
  // Signed with the original body, then the amount is changed in flight.
  const { err } = await fire(capturedEvent, { mangle: (s) => s.replace('250000', '1') });
  assert.ok(err, 'tampered payload was accepted');
  assert.equal(enrollments.length, 0);
});

test('a missing signature is rejected', async () => {
  reset();
  const { err } = await fire(capturedEvent, { signature: '' });
  assert.ok(err);
  assert.equal(enrollments.length, 0);
});

test('payment.failed marks the order without granting access', async () => {
  reset();
  const { res } = await fire({
    event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay_X', order_id: 'order_TEST123', status: 'failed' } } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(orders[0].status, 'failed');
  assert.equal(enrollments.length, 0, 'a failed payment granted access');
});

test('payment.failed after payment.captured does not revoke a paid order', async () => {
  reset();
  await fire(capturedEvent);
  await fire({
    event: 'payment.failed',
    payload: { payment: { entity: { id: 'pay_X', order_id: 'order_TEST123', status: 'failed' } } },
  });
  assert.equal(orders[0].status, 'paid', 'a late failure event wiped out a real payment');
  assert.equal(enrollments.length, 1);
});

test('refund.processed pauses access but keeps the enrolment record', async () => {
  reset();
  await fire(capturedEvent);
  const { res } = await fire({
    event: 'refund.processed',
    payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_TEST123', amount: 250000 } } },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(orders[0].status, 'refunded');
  assert.equal(enrollments.length, 1, 'enrolment was deleted — progress data lost');
  assert.equal(enrollments[0].status, 'paused');
});

test('unknown events return 200 so Razorpay stops retrying', async () => {
  reset();
  const { res } = await fire({ event: 'subscription.charged', payload: {} });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.handled, false);
});

test('an event for an unknown order is acknowledged, not crashed on', async () => {
  reset();
  const { res, err } = await fire({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_Z', order_id: 'order_NOT_OURS' } } },
  });
  assert.equal(err, null);
  assert.equal(res.statusCode, 200);
  assert.equal(enrollments.length, 0);
});
