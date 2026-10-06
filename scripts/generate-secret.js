#!/usr/bin/env node
/**
 * Generate a cryptographically random JWT secret.
 *
 *   npm run generate:secret             → print it
 *   npm run generate:secret -- --write  → write it straight into .env
 *
 * Uses crypto.randomBytes (a CSPRNG). Never invent a secret by hand, never reuse
 * one between development and production, and never paste one into a chat, an
 * email, or a screenshot — anywhere it lands is a place it can leak from.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// 48 bytes = 384 bits. HS256 needs 256 minimum; this leaves headroom.
// base64url has no +, / or = — so it never needs quoting in an env file.
const secret = crypto.randomBytes(48).toString('base64url');
const write = process.argv.includes('--write');
const envPath = path.resolve(process.cwd(), '.env');

if (!write) {
  console.log('\nJWT_SECRET=' + secret);
  console.log('\n  48 random bytes (384 bits), base64url — safe in an env file, no quoting needed.');
  console.log('  Paste it into server/.env, or skip the copy-paste entirely:');
  console.log('    npm run generate:secret -- --write\n');
  process.exit(0);
}

if (!fs.existsSync(envPath)) {
  console.error('\n✗ No .env found here. Run this first:\n    cp .env.example .env\n');
  process.exit(1);
}

let body = fs.readFileSync(envPath, 'utf8');
const existing = body.match(/^JWT_SECRET=(.*)$/m);
const current = existing?.[1]?.trim();
const isPlaceholder = !current || current.length < 32 || current.includes('change_this');

if (!isPlaceholder) {
  console.error('\n✗ .env already has a real JWT_SECRET. Not overwriting it.');
  console.error('  Rotating the secret invalidates every existing login — every user');
  console.error('  gets logged out. If that is what you want, delete the line first.\n');
  process.exit(1);
}

body = existing
  ? body.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`)
  : body.trimEnd() + `\nJWT_SECRET=${secret}\n`;

fs.writeFileSync(envPath, body, { mode: 0o600 });
console.log('\n✓ JWT_SECRET written to server/.env (file permissions set to 600)');
console.log('  Restart the server. Any existing logins are now invalid — that is expected.\n');
