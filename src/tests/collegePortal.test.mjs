/**
 * College portal tests.
 *
 * The isolation guarantees live in collegeIsolation.test.mjs (the repository).
 * This file guards the layer above it: that the portal actually USES the
 * repository, and can't quietly stop.
 *
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

const readAll = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  return e.isDirectory() ? readAll(p) : [[p, fs.readFileSync(p, 'utf8')]];
});

test('ARCHITECTURE: no college controller imports a model', () => {
  // This is the rule the whole access model rests on. A single
  // `User.find({ role: 'student' })` in here hands a SPOC every student on the
  // platform — the repository can only protect queries that go through it.
  const files = readAll(path.join(root, 'controllers/college'));
  assert.ok(files.length > 0, 'no college controllers found — did the path change?');

  for (const [file, src] of files) {
    const bad = [...src.matchAll(/^import .*from '.*\/models\/.*'/gm)].map((m) => m[0]);
    assert.deepEqual(bad, [],
      `${path.basename(file)} imports a model directly. College controllers must read ` +
      'only through collegeRepository, which $ands the scope onto every query.');
  }
});

test('ARCHITECTURE: every college controller builds a scope before reading', () => {
  const files = readAll(path.join(root, 'controllers/college'));
  for (const [file, src] of files) {
    assert.match(src, /buildCollegeScope/,
      `${path.basename(file)} never builds a scope — it cannot be reading safely.`);
    assert.match(src, /collegeRepository/,
      `${path.basename(file)} never uses the repository.`);
  }
});

test('ARCHITECTURE: the college router is role-guarded once, centrally', () => {
  const src = fs.readFileSync(path.join(root, 'routes/college/index.js'), 'utf8');
  assert.match(src, /router\.use\(protect,\s*authorize\('spoc'\)\)/,
    'the college router must apply protect + authorize("spoc") to everything at once, ' +
    'so no individual route can forget it');
});

test('ARCHITECTURE: the admin router is role-guarded once, centrally', () => {
  const src = fs.readFileSync(path.join(root, 'routes/admin/index.js'), 'utf8');
  assert.match(src, /router\.use\(protect,\s*authorize\('admin'\)\)/);
});

test('the portal is not an oracle: "missing" and "not yours" read identically', () => {
  // A distinct error for "exists but isn't yours" tells a SPOC which students —
  // or batches — belong to other colleges. Every 404 must be indistinguishable
  // between the two cases.
  //
  // An earlier version of this test asserted every notFound message in the file
  // was the SAME STRING. That was too blunt: it forced a batch endpoint to
  // report "Student not found". The rule is per-resource, and what actually
  // matters is that no message leaks WHY.
  const src = fs.readFileSync(path.join(root, 'controllers/college/portalController.js'), 'utf8');
  const messages = [...src.matchAll(/notFound\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(messages.length > 0, 'no not-found messages found — did the file move?');

  for (const m of messages) {
    assert.match(m, /in your college/i,
      `"${m}" must be scoped to the caller's college, so it reads the same either way`);
    assert.doesNotMatch(m, /another college|different college|belongs to|not yours|no access|forbidden/i,
      `"${m}" reveals that the record exists elsewhere — that is an oracle`);
  }
});

test('the scoped repository returns null (not an error) for out-of-scope batches', async () => {
  // The controller can only be honest if the repository hands it the same answer
  // for "gone" and "not yours".
  const src = fs.readFileSync(path.join(root, 'services/access/collegeRepository.js'), 'utf8');
  assert.match(src, /const owns = scope\.batchIds\.some[\s\S]{0,90}?if \(!owns\) return null;/,
    'batchRoster must return null for a batch outside the scope, exactly as it does for a missing one');
});

test('permissions catalogue and defaults stay in sync', async () => {
  const { SPOC_PERMISSIONS, DEFAULT_SPOC_PERMISSIONS, isValidPermission } =
    await import(path.join(root, 'services/access/permissions.js'));

  for (const p of DEFAULT_SPOC_PERMISSIONS) {
    assert.ok(isValidPermission(p), `default permission "${p}" is not in the catalogue`);
  }
  assert.ok(!DEFAULT_SPOC_PERMISSIONS.includes('payments:view'),
    'payments:view must never be a default');
  assert.ok(!DEFAULT_SPOC_PERMISSIONS.includes('ssat:view'),
    'ssat:view must never be a default');
  assert.ok(Object.hasOwn(SPOC_PERMISSIONS, 'payments:view'));
});

test('BOTH SPOC call sites validate departments (create AND update)', () => {
  // An earlier version of this test grepped for `Department.countDocuments(...college`.
  // It passed even with the check deleted from createSpoc — because the identical
  // line further down in updateSpoc still matched. A source regex cannot tell you
  // whether EVERY call site still validates.
  //
  // So the check now lives in one tested function, and this asserts both callers
  // use it. The behaviour itself is covered in validateSpoc.test.mjs.
  const src = fs.readFileSync(path.join(root, 'controllers/admin/spocController.js'), 'utf8');
  const calls = [...src.matchAll(/assertDepartmentsBelongTo\(/g)].length;
  assert.equal(calls, 2,
    `expected createSpoc and updateSpoc to both call assertDepartmentsBelongTo — found ${calls}`);
  assert.ok(!/Department\.countDocuments/.test(src),
    'department validation must go through assertDepartmentsBelongTo, not be inlined again');
});

test('SPOC passwords are generated, not chosen by an admin', () => {
  const src = fs.readFileSync(path.join(root, 'controllers/admin/spocController.js'), 'utf8');
  assert.match(src, /crypto\.randomBytes/,
    'temp passwords must be random — an admin typing one means the admin knows it');
});
