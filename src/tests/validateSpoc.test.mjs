/**
 * Behaviour test for the SPOC department validator.
 *
 * Exists because the source-regex version of this test was worthless: it kept
 * passing when the check was deleted from createSpoc, because an identical line
 * in updateSpoc still matched the pattern.
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const url = (p) => pathToFileURL(path.join(root, p)).href;

const DEPTS = [
  { _id: 'd1', college: 'anna' },
  { _id: 'd2', college: 'anna' },
  { _id: 'd3', college: 'vit' },
];

mock.module(url('models/org/Department.js'), {
  namedExports: {
    Department: {
      async countDocuments(q) {
        const ids = q._id?.$in || [];
        return DEPTS.filter((d) => ids.includes(d._id) && String(d.college) === String(q.college)).length;
      },
    },
  },
});

const { assertDepartmentsBelongTo } = await import(url('services/access/validateSpoc.js'));

test('departments of the right college are accepted', async () => {
  assert.equal(await assertDepartmentsBelongTo('anna', ['d1', 'd2']), true);
});

test('an empty list is accepted (means: every department in the college)', async () => {
  assert.equal(await assertDepartmentsBelongTo('anna', []), true);
  assert.equal(await assertDepartmentsBelongTo('anna'), true);
});

test('THE POINT: a department from another college is rejected', async () => {
  await assert.rejects(
    () => assertDepartmentsBelongTo('anna', ['d3']),
    /do not belong to that college/,
    'a SPOC was allowed to be pointed at another institution\'s department',
  );
});

test('a mix of valid and foreign departments is rejected entirely', async () => {
  await assert.rejects(() => assertDepartmentsBelongTo('anna', ['d1', 'd3']), /do not belong/);
});

test('an unknown department id is rejected', async () => {
  await assert.rejects(() => assertDepartmentsBelongTo('anna', ['nope']), /do not belong/);
});
