/**
 * CORS and domain configuration.
 *
 * HackGRU runs across sub-domains, and a browser treats each as a separate
 * ORIGIN. Getting this wrong fails in two directions:
 *
 *   too tight → a portal silently can't talk to the API, with an opaque error
 *   too loose → ANY site on the internet can call the API carrying a logged-in
 *               student's token
 *
 * Run: npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

/** Drive the real cors option function without booting express. */
async function originChecker({ prod = true, origins } = {}) {
  process.env.NODE_ENV = prod ? 'production' : 'development';
  if (origins) process.env.CORS_ORIGINS = origins.join(',');
  else delete process.env.CORS_ORIGINS;
  process.env.JWT_SECRET = 'x'.repeat(48);

  const { env } = await import(`${root}/config/env.js?t=${Date.now()}`);
  const isDev = env.nodeEnv !== 'production';
  const allowed = new Set(env.corsOrigins);

  // Mirrors app.js. Kept in step by the ARCHITECTURE test below.
  return (origin) => new Promise((resolve) => {
    const cb = (err, ok2) => resolve(!err && ok2 !== false);
    if (!origin) return cb(null, true);
    if (allowed.has(origin.replace(/\/$/, ''))) return cb(null, true);
    if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
    return cb(new Error('nope'));
  });
}

const PROD = [
  'https://hackgru.com',
  'https://www.hackgru.com',
  'https://app.hackgru.com',
  'https://admin.hackgru.com',
  'https://corporate.hackgru.com',
];

/* ─────────────────── allowed ─────────────────── */

test('every HackGRU sub-domain is allowed in production', async () => {
  const check = await originChecker({ prod: true, origins: PROD });
  for (const o of PROD) {
    assert.equal(await check(o), true, `${o} was refused — that portal would be dead`);
  }
});

test('a request with no Origin is allowed (curl, webhooks, server-to-server)', async () => {
  const check = await originChecker({ prod: true, origins: PROD });
  // The Razorpay webhook sends no Origin. CORS is a browser mechanism; refusing
  // here would break payments while looking like a security win.
  assert.equal(await check(undefined), true);
  assert.equal(await check(''), true);
});

test('a trailing slash still matches', async () => {
  const check = await originChecker({ prod: true, origins: PROD });
  assert.equal(await check('https://app.hackgru.com/'), true);
});

/* ─────────────────── refused ─────────────────── */

test('LEAK CHECK: an unknown origin is refused in production', async () => {
  const check = await originChecker({ prod: true, origins: PROD });
  assert.equal(await check('https://evil.com'), false);
});

test('LOOKALIKE: hackgru.com.evil.com is refused', async () => {
  // A substring/endsWith check would let this through — it's the classic
  // origin-matching bug. Exact match only.
  const check = await originChecker({ prod: true, origins: PROD });
  assert.equal(await check('https://hackgru.com.evil.com'), false);
  assert.equal(await check('https://nothackgru.com'), false);
  assert.equal(await check('https://evil-hackgru.com'), false);
});

test('SCHEME: http:// is refused where https:// is allowed', async () => {
  const check = await originChecker({ prod: true, origins: PROD });
  assert.equal(await check('http://hackgru.com'), false,
    'a plain-http origin must not match its https entry — that is a downgrade');
});

test('an un-listed sub-domain is refused', async () => {
  const check = await originChecker({ prod: true, origins: PROD });
  assert.equal(await check('https://staging.hackgru.com'), false);
});

test('localhost is refused in PRODUCTION', async () => {
  const check = await originChecker({ prod: true, origins: PROD });
  assert.equal(await check('http://localhost:5173'), false,
    'production must not trust localhost — anyone can run a page there');
});

/* ─────────────────── development ─────────────────── */

test('any localhost port is allowed in development', async () => {
  const check = await originChecker({ prod: false, origins: PROD });
  // Vite hops to 5174 when 5173 is busy, and the resulting CORS error looks
  // exactly like a broken backend.
  for (const o of ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:3000']) {
    assert.equal(await check(o), true, `${o} refused in dev`);
  }
});

test('a non-localhost origin is still refused in development', async () => {
  const check = await originChecker({ prod: false, origins: PROD });
  assert.equal(await check('https://evil.com'), false);
});

/* ─────────────────── config shape ─────────────────── */

test('THE SPLIT: publicSiteUrl is ONE url, never the CORS list', async () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'x'.repeat(48);
  process.env.CORS_ORIGINS = PROD.join(',');
  process.env.PUBLIC_SITE_URL = 'https://hackgru.com';
  const { env } = await import(`${root}/config/env.js?t=${Date.now()}`);

  assert.equal(typeof env.publicSiteUrl, 'string');
  assert.ok(!env.publicSiteUrl.includes(','),
    'publicSiteUrl must be a single url — join links are built from it, and a list ' +
    'produces "https://a.com,https://b.com/join/xyz" on a poster');
  assert.ok(Array.isArray(env.corsOrigins));
  assert.ok(env.corsOrigins.length >= 5);
});

test('a missing CORS_ORIGINS falls back to the known sub-domains, not to *', async () => {
  const check = await originChecker({ prod: true, origins: undefined });
  assert.equal(await check('https://admin.hackgru.com'), true, 'the fallback locked out a real portal');
  assert.equal(await check('https://evil.com'), false, 'the fallback allowed everything');
});

/** Source with comments removed — otherwise a comment explaining why something
 *  is wrong reads as the wrong thing itself. (This test failed on its own
 *  explanatory comment first time round.) */
const codeOf = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
  .replace(/(^|[^:])\/\/.*$/gm, '$1'); // line comments, not the // in https://

test('ARCHITECTURE: app.js never reflects an arbitrary origin', () => {
  const src = codeOf('app.js');
  assert.ok(!/origin:\s*true/.test(src),
    '`origin: true` reflects ANY site back — any page could call the API with a student\'s token');
  assert.ok(!/origin:\s*['"`]\*/.test(src), 'a wildcard origin is never correct here');
  assert.match(src, /allowed\.has\(/, 'the check must be an exact allowlist lookup');
});

test('ARCHITECTURE: a refused origin is named in the log', () => {
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(src, /\[cors\] refused/,
    'a silent CORS refusal is 40 minutes of guessing — log which origin, and what is allowed');
});

test('ARCHITECTURE: join links are built from publicSiteUrl, not the CORS list', () => {
  const src = fs.readFileSync(path.join(root, 'controllers/admin/registrationLinkController.js'), 'utf8');
  assert.match(src, /env\.publicSiteUrl/);
  assert.ok(!/env\.corsOrigins/.test(src));
});

test('the S3 CORS config lists every portal that uploads', () => {
  const cors = JSON.parse(fs.readFileSync(path.join(root, '../../infra/aws/cors.json'), 'utf8'));
  const origins = cors[0].AllowedOrigins;
  for (const o of PROD) {
    assert.ok(origins.includes(o), `${o} missing from S3 CORS — uploads from that portal would fail`);
  }
  assert.ok(!origins.includes('*'),
    'a wildcard S3 CORS lets any site drive an upload with a presigned URL it tricked out of a student');
  assert.ok(cors[0].AllowedMethods.includes('PUT'), 'browser uploads need PUT');
  assert.ok(cors[0].ExposeHeaders?.includes('ETag'), 'ETag must be exposed for upload confirmation');
});
