/**
 * College isolation tests.
 *
 * This is the suite that matters most in the whole project. If it goes red, one
 * college can see another college's students, and that ends the relationship.
 *
 * Scenario: two colleges (Anna, VIT), each with departments and students, plus
 * one student who signed up on the public website and typed "Anna University"
 * into their profile — who must remain invisible to Anna's SPOC.
 *
 * Run: npm test
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const url = (p) => pathToFileURL(path.join(root, p)).href;

/* ─────────────────────────── fixtures ─────────────────────────── */
const ANNA = 'college_anna', VIT = 'college_vit';
const ANNA_CSE = 'dept_anna_cse', ANNA_ECE = 'dept_anna_ece', VIT_CSE = 'dept_vit_cse';
const BATCH_ANNA_CSE = 'batch_anna_cse', BATCH_ANNA_ECE = 'batch_anna_ece', BATCH_VIT_CSE = 'batch_vit_cse';

const DEPARTMENTS = [
  { _id: ANNA_CSE, college: ANNA, code: 'CSE', isActive: true },
  { _id: ANNA_ECE, college: ANNA, code: 'ECE', isActive: true },
  { _id: VIT_CSE,  college: VIT,  code: 'CSE', isActive: true },
];

const BATCHES = [
  { _id: BATCH_ANNA_CSE, college: ANNA, department: ANNA_CSE, status: 'open' },
  { _id: BATCH_ANNA_ECE, college: ANNA, department: ANNA_ECE, status: 'open' },
  { _id: BATCH_VIT_CSE,  college: VIT,  department: VIT_CSE,  status: 'open' },
];

const USERS = [
  // Anna, via registration link → visible to Anna's SPOC
  { _id: 'u_anna_1', role: 'student', name: 'Anitha R', email: 'anitha@x.com', phone: '9000000001',
    college: ANNA, department: ANNA_CSE, registrationSource: 'link', registerNumber: 'A001' },
  { _id: 'u_anna_2', role: 'student', name: 'Bala K', email: 'bala@x.com', phone: '9000000002',
    college: ANNA, department: ANNA_ECE, registrationSource: 'link', registerNumber: 'A002' },
  // VIT, via link → must NEVER appear for Anna
  { _id: 'u_vit_1', role: 'student', name: 'Chitra M', email: 'chitra@x.com', phone: '9000000003',
    college: VIT, department: VIT_CSE, registrationSource: 'link', registerNumber: 'V001' },
  // Signed up on the public website and TYPED "Anna University" — no college link.
  { _id: 'u_public', role: 'student', name: 'Deepak S', email: 'deepak@x.com', phone: '9000000004',
    college: null, department: null, registrationSource: 'website', institution: 'Anna University' },
];

/* ───────────────────── in-memory fake models ───────────────────── */
const matches = (doc, q) => Object.entries(q).every(([k, v]) => {
  if (k === '$and') return v.every((sub) => matches(doc, sub));
  if (k === '$or') return v.some((sub) => matches(doc, sub));
  const dv = doc[k];
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    if ('$in' in v) return v.$in.some((x) => String(x) === String(dv));
    if ('$nin' in v) return !v.$nin.some((x) => String(x) === String(dv));
    if ('$ne' in v) return String(dv) !== String(v.$ne);
    if ('$exists' in v) return (dv !== undefined) === v.$exists;
  }
  return String(dv) === String(v);
});

const chain = (rows) => {
  const c = {
    sort: () => c, skip: () => c, limit: () => c, select: () => c, populate: () => c,
    lean: async () => rows,
    then: (res) => res(rows),
  };
  return c;
};

const FakeUser = {
  find: (q) => chain(USERS.filter((u) => matches(u, q))),
  findOne: (q) => chain(USERS.find((u) => matches(u, q)) || null),
  countDocuments: async (q) => USERS.filter((u) => matches(u, q)).length,
  exists: async (q) => USERS.find((u) => matches(u, q)) || null,
};
const FakeDepartment = { find: (q) => chain(DEPARTMENTS.filter((d) => matches(d, q))) };
const FakeBatch = {
  find: (q) => chain(BATCHES.filter((b) => matches(b, q))),
  countDocuments: async (q) => BATCHES.filter((b) => matches(b, q)).length,
};
const FakeEnrollment = { find: () => chain([]), countDocuments: async () => 0 };
const FakeOrder = { find: () => chain([]) };
const FakeResult = { find: () => chain([]) };

mock.module(url('models/User.js'), { namedExports: { User: FakeUser } });
mock.module(url('models/org/Department.js'), { namedExports: { Department: FakeDepartment } });
mock.module(url('models/org/Batch.js'), { namedExports: { Batch: FakeBatch } });
mock.module(url('models/Enrollment.js'), { namedExports: { Enrollment: FakeEnrollment } });
mock.module(url('models/Order.js'), { namedExports: { Order: FakeOrder } });
mock.module(url('models/ssat/Result.js'), { namedExports: { Result: FakeResult } });

const { buildCollegeScope } = await import(url('services/access/collegeScope.js'));
const { collegeRepository } = await import(url('services/access/collegeRepository.js'));
const { DEFAULT_SPOC_PERMISSIONS } = await import(url('services/access/permissions.js'));

const spoc = (over = {}) => ({
  _id: 'spoc_1', role: 'spoc',
  spocAccess: { college: ANNA, departments: [], batches: [], can: [...DEFAULT_SPOC_PERMISSIONS], ...over },
});

const repoFor = async (u) => collegeRepository(await buildCollegeScope(u));

/* ──────────────────────────── tests ───────────────────────────── */

test('THE RULE: a SPOC sees only their own college students', async () => {
  const repo = await repoFor(spoc());
  const { students } = await repo.students();
  const names = students.map((s) => s.name).sort();
  assert.deepEqual(names, ['Anitha R', 'Bala K']);
});

test('LEAK CHECK: another college\'s students are never returned', async () => {
  const repo = await repoFor(spoc());
  const { students } = await repo.students();
  assert.ok(!students.some((s) => s.name === 'Chitra M'), 'VIT student leaked to Anna');
});

test('THE POINT: a website signup who TYPED "Anna University" stays invisible', async () => {
  const repo = await repoFor(spoc());
  const { students } = await repo.students();
  assert.ok(!students.some((s) => s.name === 'Deepak S'),
    'a self-registered student appeared in a college portal');
});

test('a caller cannot widen the scope by passing its own college filter', async () => {
  const repo = await repoFor(spoc());
  // A controller doing something careless — or malicious.
  const { students } = await repo.students({ filter: { college: VIT } });
  assert.equal(students.length, 0, 'scope was overridden by the caller filter');
});

test('SPREAD TRAP: a caller passing college AND department cannot escape the scope', async () => {
  // The sharp version of the test above. A spread — `{...scope, ...filter}` —
  // survives a caller that overrides only `college`, because the scope's
  // `department` filter still excludes the foreign student by luck. Override
  // BOTH and a spread leaks; $and does not. This is the test that fails if
  // anyone "simplifies" bounded() back into a spread.
  const repo = await repoFor(spoc());
  const { students } = await repo.students({ filter: { college: VIT, department: VIT_CSE } });
  assert.equal(students.length, 0,
    'a foreign student was returned — bounded() must $and the scope, never spread it');
});

test('a caller cannot widen the scope with a top-level $or', async () => {
  const repo = await repoFor(spoc());
  const { students } = await repo.students({ filter: { $or: [{ college: VIT }, { college: ANNA }] } });
  assert.ok(!students.some((s) => s.name === 'Chitra M'), '$or widened the scope');
});

test('department-limited SPOC sees only their departments', async () => {
  const repo = await repoFor(spoc({ departments: [ANNA_CSE] }));
  const { students } = await repo.students();
  assert.deepEqual(students.map((s) => s.name), ['Anitha R']);
});

test('fetching another college\'s student by ID returns nothing', async () => {
  const repo = await repoFor(spoc());
  assert.equal(await repo.student('u_vit_1'), null);
  assert.equal(await repo.student('u_public'), null);
  assert.ok(await repo.student('u_anna_1'));
});

test('owns() gates nested lookups', async () => {
  const repo = await repoFor(spoc());
  assert.equal(await repo.owns('u_anna_1'), true);
  assert.equal(await repo.owns('u_vit_1'), false);
  assert.equal(await repo.owns('u_public'), false);
});

test('contact details are hidden without students:contact', async () => {
  const repo = await repoFor(spoc({ can: ['students:view'] }));
  const { students } = await repo.students();
  assert.equal(students[0].email, undefined, 'email leaked without permission');
  assert.equal(students[0].phone, undefined, 'phone leaked without permission');
  assert.ok(students[0].name);
});

test('contact details appear when granted', async () => {
  const repo = await repoFor(spoc({ can: ['students:view', 'students:contact'] }));
  const { students } = await repo.students();
  assert.equal(students[0].email, 'anitha@x.com');
});

test('a permission the SPOC lacks throws rather than returning data', async () => {
  const repo = await repoFor(spoc({ can: [] }));
  await assert.rejects(() => repo.students(), /students:view/);
});

test('payments:view is OFF by default — amounts never appear', async () => {
  assert.ok(!DEFAULT_SPOC_PERMISSIONS.includes('payments:view'),
    'payments:view must not be a default — it is financial data and exposes your pricing');
});

test('a SPOC with no college is rejected loudly, not silently scoped to nothing', async () => {
  await assert.rejects(
    () => buildCollegeScope({ _id: 'x', role: 'spoc', spocAccess: { college: null } }),
    /not linked to a college/,
  );
});

test('a non-spoc cannot build a college scope', async () => {
  await assert.rejects(() => buildCollegeScope({ _id: 'x', role: 'student' }), /college staff/);
  await assert.rejects(() => buildCollegeScope({ _id: 'x', role: 'admin' }), /college staff/);
});

test('explicit batch IDs from another college cannot widen the scope', async () => {
  // Someone hand-edits a spoc's batch list to include a VIT batch.
  const scope = await buildCollegeScope(spoc({ batches: [BATCH_VIT_CSE] }));
  assert.ok(!scope.batchIds.map(String).includes(BATCH_VIT_CSE),
    'a foreign batch ID survived scope resolution');
});

test('the college filter is present on every student query', async () => {
  const scope = await buildCollegeScope(spoc());
  assert.equal(String(scope.studentFilter.college), ANNA);
  assert.equal(scope.studentFilter.role, 'student');
  assert.ok(Object.isFrozen(scope.studentFilter), 'the scope filter must be immutable');
});

test('ARCHITECTURE: the repository never exposes work-style / EQ data', async () => {
  // Read the source: those fields must not be selectable, whatever a caller asks.
  const fs = await import('node:fs');
  const src = fs.readFileSync(path.join(root, 'services/access/collegeRepository.js'), 'utf8');
  const ssatSelect = src.match(/Result\.find[\s\S]{0,200}?\.select\('([^']+)'\)/)?.[1] || '';
  assert.ok(!/workStyle|eqProfile/.test(ssatSelect),
    'the college repository must never select workStyle or eqProfile');
  assert.ok(/dimensions/.test(ssatSelect), 'ability scores should still be available');
});
