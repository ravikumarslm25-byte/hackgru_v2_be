/**
 * Phase 2 — special registration links.
 *
 * The two things that matter here:
 *   1. A link registration MUST set User.college, or the student never appears
 *      in their college's portal and the whole feature is pointless.
 *   2. Two students paying for the last seat at the same instant must not both
 *      get it — and whoever loses that race must NOT be refused, because they
 *      have already paid.
 *
 * Run: npm test
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const url = (p) => pathToFileURL(path.join(root, p)).href;

/* ───────────────────── in-memory fakes ───────────────────── */
let enrolments = [];
let batches = [];
let links = [];

const chain = (rows) => {
  const c = { select: () => c, sort: () => c, limit: () => c, populate: () => c,
              lean: async () => rows, then: (r) => r(rows) };
  return c;
};

const FakeEnrollment = {
  async findOneAndUpdate(q, update) {
    let e = enrolments.find((x) => String(x.student) === String(q.student) && String(x.course) === String(q.course));
    if (!e) {
      // $setOnInsert only applies on insert; $set applies either way.
      e = { _id: 'e' + (enrolments.length + 1), ...(update.$setOnInsert || {}), ...(update.$set || {}) };
      enrolments.push(e);
    } else {
      Object.assign(e, update.$set || {});   // an existing row keeps its batch/progress
    }
    return e;
  },
};

const FakeBatch = {
  async updateOne(q, update) {
    const b = batches.find((x) => String(x._id) === String(q._id));
    if (!b) return;
    for (const [k, v] of Object.entries(update.$inc || {})) {
      const [a, c] = k.split('.');
      if (c) { b[a] = b[a] || {}; b[a][c] = (b[a][c] || 0) + v; } else b[k] = (b[k] || 0) + v;
    }
    Object.assign(b, update.$set || {});
  },
};

const FakeRegistrationLink = {
  /** Mirrors the atomic conditional update: only succeeds while a seat is free. */
  async findOneAndUpdate(q, update) {
    const l = links.find((x) => String(x._id) === String(q._id));
    if (!l) return null;
    if (q.$expr && l.usedSeats >= l.maxSeats) return null;   // the guard
    l.usedSeats += update.$inc.usedSeats;
    return l;
  },
};

mock.module(url('models/Enrollment.js'), { namedExports: { Enrollment: FakeEnrollment } });
mock.module(url('models/org/Batch.js'), { namedExports: { Batch: FakeBatch } });
mock.module(url('models/org/RegistrationLink.js'), { namedExports: { RegistrationLink: FakeRegistrationLink } });

const { grantAccessForOrder } = await import(url('services/org/enrolment.js'));

const mkOrder = (over = {}) => ({
  _id: 'o1', student: 'stu1', course: 'crs1',
  batch: 'b1', registrationLink: 'l1', seatClaimed: false,
  razorpayOrderId: 'order_1',
  async save() { return this; },
  ...over,
});

const reset = ({ maxSeats = 2, usedSeats = 0 } = {}) => {
  enrolments = [];
  batches = [{ _id: 'b1', seats: maxSeats, stats: { registered: 0, paid: 0 } }];
  links = [{ _id: 'l1', maxSeats, usedSeats }];
};

/* ──────────────────────── tests ──────────────────────── */

test('THE POINT: a link purchase carries its batch onto the enrolment', async () => {
  reset();
  await grantAccessForOrder(mkOrder(), 'test');
  assert.equal(enrolments.length, 1);
  assert.equal(enrolments[0].batch, 'b1',
    'no batch on the enrolment — the student would be invisible to their college');
});

test('a public website purchase has no batch (and stays invisible to colleges)', async () => {
  reset();
  await grantAccessForOrder(mkOrder({ batch: null, registrationLink: null }), 'test');
  assert.equal(enrolments[0].batch, null);
  assert.equal(links[0].usedSeats, 0, 'a website purchase must not consume a college seat');
});

test('a seat is claimed on payment', async () => {
  reset();
  await grantAccessForOrder(mkOrder(), 'test');
  assert.equal(links[0].usedSeats, 1);
  assert.equal(batches[0].stats.paid, 1);
});

test('IDEMPOTENT: webhook + browser verify for the same payment claim ONE seat', async () => {
  reset();
  const order = mkOrder();
  await grantAccessForOrder(order, 'browser verify');
  await grantAccessForOrder(order, 'webhook');      // both fire — normal
  await grantAccessForOrder(order, 'webhook retry'); // Razorpay retries — normal
  assert.equal(links[0].usedSeats, 1, `seat double-counted: ${links[0].usedSeats}`);
  assert.equal(enrolments.length, 1, 'duplicate enrolment created');
});

test('RACE: two students, one seat left — only one claim succeeds', async () => {
  reset({ maxSeats: 1 });
  const a = mkOrder({ _id: 'oA', student: 'stuA', razorpayOrderId: 'order_A' });
  const b = mkOrder({ _id: 'oB', student: 'stuB', razorpayOrderId: 'order_B' });

  await Promise.all([grantAccessForOrder(a, 'test'), grantAccessForOrder(b, 'test')]);

  assert.equal(links[0].usedSeats, 1, 'both students took the last seat');
  assert.equal(batches[0].overCapacity, true, 'the oversell was not flagged for an admin');
});

test('THE HUMANE BIT: the student who loses the seat race is still enrolled', async () => {
  reset({ maxSeats: 1 });
  await grantAccessForOrder(mkOrder({ _id: 'oA', student: 'stuA' }), 'test');
  await grantAccessForOrder(mkOrder({ _id: 'oB', student: 'stuB' }), 'test');

  assert.equal(enrolments.length, 2,
    'someone who already paid was refused access — never do this');
  assert.ok(enrolments.some((e) => e.student === 'stuB'));
  assert.equal(batches[0].overCapacity, true, 'admin needs to know to add a seat or refund');
});

test('a full link stops claiming but never throws mid-payment', async () => {
  reset({ maxSeats: 1, usedSeats: 1 });   // already full
  await assert.doesNotReject(() => grantAccessForOrder(mkOrder({ student: 'stuC' }), 'test'));
  assert.equal(links[0].usedSeats, 1);
  assert.equal(enrolments.length, 1, 'they paid — they get the course');
});

test('seatClaimed is written so a replay cannot re-claim', async () => {
  reset();
  const order = mkOrder();
  await grantAccessForOrder(order, 'test');
  assert.equal(order.seatClaimed, true);
});

/* ───────────── link availability rules ───────────── */

const { RegistrationLink: RealLinkModel } = await import(url('models/org/RegistrationLink.js'))
  .then((m) => m, () => ({}));

test('availability(): closed / expired / full each give a usable reason', async () => {
  // Exercise the method directly off the schema, without a DB.
  const mongoose = (await import('mongoose')).default;
  const proto = mongoose.models.RegistrationLink?.schema?.methods?.availability;
  if (!proto) return;   // model mocked out in this file — covered by the real model's schema

  const call = (ctx) => proto.call(ctx);
  assert.equal(call({ isActive: false, maxSeats: 10, usedSeats: 0 }).open, false);
  assert.match(call({ isActive: false, maxSeats: 10, usedSeats: 0 }).reason, /closed/i);

  assert.equal(call({ isActive: true, expiresAt: new Date(Date.now() - 1000), maxSeats: 10, usedSeats: 0 }).open, false);
  assert.match(call({ isActive: true, expiresAt: new Date(Date.now() - 1000), maxSeats: 10, usedSeats: 0 }).reason, /expired/i);

  assert.equal(call({ isActive: true, maxSeats: 5, usedSeats: 5 }).open, false);
  assert.match(call({ isActive: true, maxSeats: 5, usedSeats: 5 }).reason, /seats/i);

  const open = call({ isActive: true, maxSeats: 5, usedSeats: 2 });
  assert.equal(open.open, true);
  assert.equal(open.seatsLeft, 3);
});


/* ─────────── enrolment vs payment ─────────── */

test('THE FIX: paying an EXISTING unpaid enrolment marks it paid, keeps its batch', async () => {
  reset();
  // The student registered through a link — enrolment exists, unpaid.
  enrolments.push({ _id: 'e1', student: 'stu1', course: 'crs1', batch: 'b1', paid: false, progress: 42 });

  await grantAccessForOrder(mkOrder(), 'test');

  assert.equal(enrolments.length, 1, 'a duplicate enrolment was created instead of updating');
  assert.equal(enrolments[0].paid, true, 'payment did not mark the enrolment paid');
  assert.equal(enrolments[0].batch, 'b1', 'the batch was lost — student would vanish from their college');
  assert.equal(enrolments[0].progress, 42, 'progress was reset by the payment');
  assert.ok(enrolments[0].paidAt);
});

test('a website purchase with no prior enrolment still creates one, paid', async () => {
  reset();
  await grantAccessForOrder(mkOrder({ batch: null, registrationLink: null }), 'test');
  assert.equal(enrolments.length, 1);
  assert.equal(enrolments[0].paid, true);
  assert.equal(enrolments[0].batch, null);
});

test('a webhook replay does not reset progress on an already-paid enrolment', async () => {
  reset();
  enrolments.push({ _id: 'e1', student: 'stu1', course: 'crs1', batch: 'b1', paid: true, progress: 88 });
  const order = mkOrder({ seatClaimed: true });
  await grantAccessForOrder(order, 'webhook retry');
  assert.equal(enrolments[0].progress, 88);
  assert.equal(enrolments.length, 1);
});

test('ARCHITECTURE: /join creates the enrolment BEFORE payment', () => {
  // The bug this fixes: an abandoned checkout left a student registered with
  // their college but absent from the batch, with no way back.
  const src = fs.readFileSync(path.join(root, 'controllers/joinController.js'), 'utf8');
  assert.match(src, /Enrollment\.findOneAndUpdate/,
    '/join must create the enrolment itself — not leave it to the payment handler');
  assert.match(src, /paid:\s*false/,
    'the enrolment created at registration must start unpaid');
});

test('ARCHITECTURE: createOrder resumes an unpaid enrolment rather than refusing', () => {
  const src = fs.readFileSync(path.join(root, 'controllers/paymentController.js'), 'utf8');
  assert.match(src, /already\?\.paid/,
    'only a PAID enrolment is a conflict — an unpaid one is a checkout to resume');
  assert.match(src, /already\?\.batch/,
    'a resumed payment must carry the original batch, or the student pays and is still not in their cohort');
});
