/**
 * SSAT controller integration test.
 *
 * WHY THIS EXISTS: the "stuck on question 1" bug survived a green unit-test run
 * because those tests exercised the pure helpers, not the controller. This drives
 * the REAL controller handlers against in-memory fake models, so the whole
 * serve → answer → serve loop is covered.
 *
 * Run: node --experimental-test-module-mocks --test src/tests/ssatFlow.test.mjs
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const url = (p) => pathToFileURL(path.join(root, p)).href;

/* ------------------------- in-memory fake models ------------------------- */
let store = { sessions: [], results: [] };
let nextId = 1;

class FakeSessionDoc {
  constructor(data) {
    Object.assign(this, {
      _id: `s${nextId++}`, state: 'in-progress', modules: [], moduleItemCount: {},
      servedItemIds: [], responses: [], profile: {}, dialogue: [], dialogueTurns: 0,
      ability: {}, timeSpentMs: 0, startedAt: new Date(),
      expiresAt: new Date(Date.now() + 48 * 3600e3), ...data,
    });
  }
  markModified() {}
  async save() { return this; }
}

/** Mongoose findOne is awaitable AND chainable (.sort().lean()) — mimic both. */
const docChain = (doc) => {
  const p = Promise.resolve(doc);
  p.sort = () => docChain(doc);
  p.select = () => docChain(doc);
  p.lean = () => Promise.resolve(doc);
  return p;
};

const matchSession = (q) => store.sessions.find((s) =>
  (!q._id || String(s._id) === String(q._id)) &&
  (!q.student || String(s.student) === String(q.student)) &&
  (!q.state || s.state === q.state)) || null;

const FakeSession = {
  async create(data) { const d = new FakeSessionDoc(data); store.sessions.push(d); return d; },
  findOne(q) { return docChain(matchSession(q)); },
  async updateMany(q, set) { store.sessions.filter((s) => s.state === q.state).forEach((s) => Object.assign(s, set)); },
  async updateOne(q, set) { const s = matchSession(q); if (s) Object.assign(s, set); },
};

const ROLES = [
  { role: 'frontend-developer', label: 'Frontend Developer', summary: 'Builds what users see.', isActive: true, importance: { javascript: 1, 'frontend-framework': 0.9 }, requiredLevels: { javascript: 70 } },
  { role: 'qa-engineer', label: 'QA / Test Engineer', summary: 'Finds what breaks.', isActive: true, importance: { 'testing-fundamentals': 1 }, requiredLevels: { 'testing-fundamentals': 70 } },
];
let rolesInDb = ROLES;
const chain = (rows) => ({ select: () => chain(rows), sort: () => chain(rows), limit: () => chain(rows), lean: async () => rows });
const FakeRoleProfile = {
  find: () => chain(rolesInDb.filter((r) => r.isActive)),
  findOne: (q) => chain(rolesInDb.find((r) => r.role === q.role) || null),
};
const FakeItem = {
  find: () => chain([]), findById: () => chain(null), async updateOne() {},
};
const FakeResult = { async create(d) { const r = { _id: `r${nextId++}`, ...d }; store.results.push(r); return r; }, findById: () => chain(store.results[0] || null) };
const FakeCourse = { find: () => chain([]) };

mock.module(url('models/ssat/Session.js'), { namedExports: { Session: FakeSession } });
mock.module(url('models/ssat/RoleProfile.js'), { namedExports: { RoleProfile: FakeRoleProfile } });
mock.module(url('models/ssat/Item.js'), { namedExports: { Item: FakeItem } });
mock.module(url('models/ssat/Result.js'), { namedExports: { Result: FakeResult } });
mock.module(url('models/Course.js'), { namedExports: { Course: FakeCourse } });

const C = await import(url('controllers/ssatController.js'));

/* ------------------------------ test harness ----------------------------- */
const mkRes = () => ({
  statusCode: 200, body: null,
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
});

async function call(handler, req) {
  const res = mkRes();
  let err = null;
  await handler(req, res, (e) => { err = e; });
  if (err) throw err;
  return res;
}

const USER = { _id: 'u1', name: 'Ravikumar' };
const reset = () => { store = { sessions: [], results: [] }; rolesInDb = ROLES; };

/* --------------------------------- tests --------------------------------- */

test('THE BUG: answering a profiler question serves a DIFFERENT question next', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;

  const first = await call(C.getNextItem, { user: USER, params: { id } });
  const q1 = first.body.data.item;
  assert.ok(q1, 'a question was served');

  await call(C.submitAnswer, {
    user: USER, params: { id },
    body: { itemId: q1.id, chosenKey: q1.options[0].key, timeTakenMs: 500 },
  });

  const second = await call(C.getNextItem, { user: USER, params: { id } });
  const q2 = second.body.data.item;

  assert.notEqual(q2.id, q1.id, `STUCK: served "${q1.id}" again after answering it`);
});

test('the first question always has options to click', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;
  const r = await call(C.getNextItem, { user: USER, params: { id } });
  const item = r.body.data.item;
  assert.ok(item.options.length > 0, `"${item.id}" was served with zero options — unanswerable`);
});

test('p-role options are resolved server-side from RoleProfile', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;
  const r = await call(C.getNextItem, { user: USER, params: { id } });
  const item = r.body.data.item;
  assert.equal(item.id, 'p-role');
  assert.deepEqual(item.options.map((o) => o.key).sort(), ['frontend-developer', 'qa-engineer']);
});

test('REGRESSION: unseeded roles must not hard-lock the student', async () => {
  reset();
  rolesInDb = [];   // nobody ran `npm run seed:ssat`
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;

  const r = await call(C.getNextItem, { user: USER, params: { id } });
  const item = r.body.data.item;
  // p-role must be skipped, not served empty
  assert.notEqual(item?.id, 'p-role', 'served an unanswerable p-role with no roles in the DB');
  assert.ok(item.options.length > 0, 'served a question with no options');
});

test('walks the whole profiler without repeating or stalling', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;

  const seen = [];
  for (let i = 0; i < 12; i++) {
    const r = await call(C.getNextItem, { user: USER, params: { id } });
    const item = r.body.data.item;
    if (!item || item.kind !== 'profiler') break;
    seen.push(item.id);
    await call(C.submitAnswer, {
      user: USER, params: { id },
      body: { itemId: item.id, chosenKey: item.options[0].key, timeTakenMs: 400 },
    });
  }
  assert.ok(seen.length >= 4, `only got through ${seen.length} profiler questions`);
  assert.equal(new Set(seen).size, seen.length, `repeated a question: ${seen.join(', ')}`);
});

test('progress actually moves during the profiler', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;

  const r1 = await call(C.getNextItem, { user: USER, params: { id } });
  const p0 = r1.body.data.progress.percent;
  const item = r1.body.data.item;

  const a = await call(C.submitAnswer, {
    user: USER, params: { id },
    body: { itemId: item.id, chosenKey: item.options[0].key, timeTakenMs: 400 },
  });
  assert.ok(a.body.data.progress.percent > p0, `progress frozen at ${p0}%`);
});

test('the answer is actually stored on the profile', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;
  const r = await call(C.getNextItem, { user: USER, params: { id } });
  const item = r.body.data.item;

  await call(C.submitAnswer, {
    user: USER, params: { id },
    body: { itemId: item.id, chosenKey: 'qa-engineer', timeTakenMs: 400 },
  });
  const session = await FakeSession.findOne({ _id: id });
  assert.equal(session.profile.role, 'qa-engineer');
});

test('an invalid option is rejected rather than silently stored', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;
  const r = await call(C.getNextItem, { user: USER, params: { id } });
  const item = r.body.data.item;

  await assert.rejects(
    () => call(C.submitAnswer, {
      user: USER, params: { id },
      body: { itemId: item.id, chosenKey: 'not-a-real-role', timeTakenMs: 100 },
    }),
    /not a valid option/,
  );
});

test('double-submitting the same answer does not skip a question', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;
  const r = await call(C.getNextItem, { user: USER, params: { id } });
  const item = r.body.data.item;
  const body = { itemId: item.id, chosenKey: item.options[0].key, timeTakenMs: 300 };

  await call(C.submitAnswer, { user: USER, params: { id }, body });
  const dup = await call(C.submitAnswer, { user: USER, params: { id }, body });
  assert.equal(dup.body.data.stale, true, 'a duplicate submit was treated as a fresh answer');

  const after = await call(C.getNextItem, { user: USER, params: { id } });
  assert.notEqual(after.body.data.item.id, item.id);
});

test('discovery path is not asked which role it wants', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'discovery' } });
  const id = started.body.data.session.id;
  const r = await call(C.getNextItem, { user: USER, params: { id } });
  assert.notEqual(r.body.data.item.id, 'p-role');
});

test('a stuck session can be abandoned', async () => {
  reset();
  const started = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const id = started.body.data.session.id;

  await call(C.abandonSession, { user: USER, params: { id } });
  const active = await call(C.getActiveSession, { user: USER });
  assert.equal(active.body.data.session, null, 'session still active after abandon');
});

test('starting a new session abandons the old one', async () => {
  reset();
  const a = await call(C.startSession, { user: USER, body: { path: 'clear' } });
  const b = await call(C.startSession, { user: USER, body: { path: 'discovery' } });
  assert.notEqual(a.body.data.session.id, b.body.data.session.id);
  const old = store.sessions.find((s) => String(s._id) === String(a.body.data.session.id));
  assert.equal(old.state, 'abandoned');
});
