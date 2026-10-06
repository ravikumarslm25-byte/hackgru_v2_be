/**
 * File storage security.
 *
 * These are the failures that matter:
 *   • a client choosing its own key → overwrite anyone's photo, or path-traverse
 *   • an unpinned content type      → declare image/jpeg, upload HTML, stored XSS
 *   • an unenforced size limit      → your S3 bill
 *   • a public bucket               → every project report readable by URL
 *
 * Run: npm test
 */
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const url = (p) => pathToFileURL(path.join(root, p)).href;

process.env.AWS_S3_BUCKET = 'test-bucket';
process.env.AWS_REGION = 'ap-south-1';
process.env.AWS_ACCESS_KEY_ID = 'AKIATEST';
process.env.AWS_SECRET_ACCESS_KEY = 'secret';

let uploads = [];
mock.module(url('models/Upload.js'), {
  namedExports: {
    Upload: {
      async create(doc) {
        const rec = { _id: 'up' + (uploads.length + 1), ...doc, async save() { return this; } };
        uploads.push(rec);
        return rec;
      },
      async findById(id) { return uploads.find((u) => String(u._id) === String(id)) || null; },
    },
  },
});

// Presigning must not need a live AWS call.
mock.module('@aws-sdk/s3-request-presigner', {
  namedExports: { getSignedUrl: async (_c, cmd) => `https://s3.test/${cmd.input.Key}?sig=x` },
});

const { presignUpload, PURPOSES } = await import(url('services/storage/index.js'));

const student = { _id: 'stu_AAA', role: 'student' };
const other = { _id: 'stu_BBB', role: 'student' };
const admin = { _id: 'adm_1', role: 'admin' };

const reset = () => { uploads = []; };

/* ───────────────── the key ───────────────── */

test('THE RULE: the key comes from the authenticated user, not the client', async () => {
  reset();
  const r = await presignUpload({
    user: student, purpose: 'student-photo',
    filename: 'me.jpg', contentType: 'image/jpeg', size: 1000,
  });
  const rec = uploads[0];
  assert.match(rec.key, /^students\/stu_AAA\/photo\//,
    `key "${rec.key}" is not scoped to the uploading student`);
  assert.ok(r.url.includes(rec.key));
});

test('LEAK CHECK: two students cannot land on the same key', async () => {
  reset();
  await presignUpload({ user: student, purpose: 'student-photo', filename: 'a.jpg', contentType: 'image/jpeg', size: 100 });
  await presignUpload({ user: other, purpose: 'student-photo', filename: 'a.jpg', contentType: 'image/jpeg', size: 100 });
  assert.match(uploads[0].key, /stu_AAA/);
  assert.match(uploads[1].key, /stu_BBB/);
  assert.notEqual(uploads[0].key, uploads[1].key);
});

test('PATH TRAVERSAL: a filename full of ../ cannot escape the prefix', async () => {
  reset();
  await presignUpload({
    user: student, purpose: 'student-photo',
    filename: '../../../projects/victim/report.pdf', contentType: 'image/jpeg', size: 100,
  });
  const rec = uploads[0];
  assert.match(rec.key, /^students\/stu_AAA\/photo\//, `escaped: ${rec.key}`);
  assert.ok(!rec.key.includes('..'), `key contains ..: ${rec.key}`);
  assert.ok(!rec.originalName.includes('/'), `stored name kept a path: ${rec.originalName}`);
});

test('the same filename twice produces different keys (no silent overwrite)', async () => {
  reset();
  await presignUpload({ user: student, purpose: 'student-photo', filename: 'p.jpg', contentType: 'image/jpeg', size: 100 });
  await presignUpload({ user: student, purpose: 'student-photo', filename: 'p.jpg', contentType: 'image/jpeg', size: 100 });
  assert.notEqual(uploads[0].key, uploads[1].key);
});

/* ───────────────── content type ───────────────── */

test('XSS GUARD: HTML cannot be uploaded as a photo', async () => {
  reset();
  await assert.rejects(
    () => presignUpload({ user: student, purpose: 'student-photo', filename: 'x.html', contentType: 'text/html', size: 100 }),
    /must be/i,
  );
  assert.equal(uploads.length, 0, 'a rejected upload still created a record');
});

test('XSS GUARD: the content type is baked into the signature', async () => {
  reset();
  // If ContentType weren't signed, a client could declare image/jpeg here and
  // then PUT text/html — S3 would accept it.
  const seen = [];
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  await presignUpload({ user: student, purpose: 'student-photo', filename: 'a.jpg', contentType: 'image/jpeg', size: 100 });
  const src = fs.readFileSync(path.join(root, 'services/storage/index.js'), 'utf8');
  assert.match(src, /new PutObjectCommand\(\{[\s\S]{0,300}?ContentType: contentType/,
    'ContentType must be part of the signed PutObjectCommand');
  assert.match(src, /new PutObjectCommand\(\{[\s\S]{0,300}?ContentLength: bytes/,
    'ContentLength must be signed too, or the size limit is advisory');
});

test('a PDF cannot be uploaded as a photo, and vice versa', async () => {
  reset();
  await assert.rejects(() => presignUpload({
    user: student, purpose: 'student-photo', filename: 'r.pdf', contentType: 'application/pdf', size: 100 }), /must be/i);
  await assert.rejects(() => presignUpload({
    user: student, purpose: 'project-report', filename: 'p.jpg', contentType: 'image/jpeg', size: 100 }), /must be/i);
});

/* ───────────────── size ───────────────── */

test('an oversized file is refused before it reaches S3', async () => {
  reset();
  await assert.rejects(() => presignUpload({
    user: student, purpose: 'student-photo', filename: 'big.jpg',
    contentType: 'image/jpeg', size: 10 * 1024 * 1024,
  }), /under 3MB/);
  assert.equal(uploads.length, 0);
});

test('an empty file is refused', async () => {
  reset();
  await assert.rejects(() => presignUpload({
    user: student, purpose: 'student-photo', filename: 'e.jpg', contentType: 'image/jpeg', size: 0 }), /empty/);
});

/* ───────────────── roles ───────────────── */

test('a student cannot upload course material', async () => {
  reset();
  await assert.rejects(() => presignUpload({
    user: student, purpose: 'course-material', filename: 'x.pdf', contentType: 'application/pdf', size: 100 }),
    /can't upload/i);
});

test('an admin can upload course material', async () => {
  reset();
  const r = await presignUpload({
    user: admin, purpose: 'course-material', filename: 'week1.pdf', contentType: 'application/pdf', size: 100 });
  assert.ok(r.url);
  assert.match(uploads[0].key, /^materials\//);
});

test('an unknown purpose is refused', async () => {
  reset();
  await assert.rejects(() => presignUpload({
    user: student, purpose: 'anything', filename: 'x.pdf', contentType: 'application/pdf', size: 100 }), /Unknown/);
});

/* ───────────────── architecture ───────────────── */

test('ARCHITECTURE: nothing is ever uploaded with a public ACL', () => {
  const src = fs.readFileSync(path.join(root, 'services/storage/index.js'), 'utf8');
  assert.ok(!/ACL:\s*['"]public-read/.test(src),
    'a public-read ACL would make student photos and project reports readable by anyone with the URL');
});

test('ARCHITECTURE: presigned reads are short-lived', () => {
  const src = fs.readFileSync(path.join(root, 'services/storage/index.js'), 'utf8');
  const expiries = [...src.matchAll(/expiresIn:\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(expiries.length > 0, 'no expiry set — presigned URLs would last a week by default');
  for (const e of expiries) {
    assert.ok(e <= 900, `expiresIn ${e}s is too long; a link pasted into a group chat should stop working`);
  }
});

test('ARCHITECTURE: a download URL is not decided by the client', () => {
  const src = fs.readFileSync(path.join(root, 'controllers/uploadController.js'), 'utf8');
  assert.match(src, /async function canRead/, 'downloads must go through an authorisation check');
  assert.match(src, /repo\.owns\(record\.owner\)/,
    'a SPOC download must go through collegeRepository.owns — the same boundary as everything else');
  // Identical answer whether it's missing or not theirs.
  const notFounds = [...src.matchAll(/notFound\('([^']+)'\)/g)].map((m) => m[1]);
  assert.equal(new Set(notFounds).size, 1,
    `a distinct error for "not yours" confirms the file exists: ${notFounds.join(' | ')}`);
});

test('every purpose has a size cap and an accept list', () => {
  for (const [name, p] of Object.entries(PURPOSES)) {
    assert.ok(p.maxBytes > 0, `${name} has no size cap`);
    assert.ok(p.accept?.length > 0, `${name} accepts anything`);
    assert.ok(p.roles?.length > 0, `${name} has no role restriction`);
    assert.equal(typeof p.key, 'function', `${name} has no server-side key builder`);
  }
});
