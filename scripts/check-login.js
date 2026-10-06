#!/usr/bin/env node
/**
 * Diagnose a login. Answers "why can't I sign in?" with facts.
 *
 *   npm run check:login                                   → list every admin and spoc
 *   npm run check:login -- --email you@hackgru.com        → inspect one account
 *   npm run check:login -- --email x@y.com --password abc → also test the password
 *
 * Read-only. Changes nothing.
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/config/db.js';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const run = async () => {
  const email = (arg('email') || '').toLowerCase().trim();
  const password = arg('password');

  await connectDB();
  console.log(`\n  Database: ${mongoose.connection.name}   (from MONGO_URI)\n`);

  /* ── No email: show who can log in at all ── */
  if (!email) {
    const [admins, spocs, students] = await Promise.all([
      User.find({ role: 'admin' }).select('name email isActive createdAt').lean(),
      User.find({ role: 'spoc' }).select('name email isActive').lean(),
      User.countDocuments({ role: 'student' }),
    ]);

    console.log(`  ADMINS (${admins.length})`);
    if (!admins.length) {
      console.log('    none — nobody can reach /admin.');
      console.log('    Create one:  npm run create:admin -- --email you@x.com --name "Your Name"');
    }
    admins.forEach((a) => console.log(`    ${a.isActive === false ? '✗ DISABLED' : '✓'}  ${a.email}  (${a.name})`));

    console.log(`\n  COLLEGE STAFF (${spocs.length})`);
    if (!spocs.length) console.log('    none — create them from the admin panel → College Staff.');
    spocs.forEach((s) => console.log(`    ${s.isActive === false ? '✗ DISABLED' : '✓'}  ${s.email}  (${s.name})`));

    console.log(`\n  STUDENTS: ${students}\n`);
    await mongoose.connection.close();
    return;
  }

  /* ── One account, in detail ── */
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    console.log(`  ✗ No account with the email "${email}".\n`);
    const similar = await User.find({ email: new RegExp(email.split('@')[0], 'i') })
      .select('email role').limit(5).lean();
    if (similar.length) {
      console.log('    Did you mean one of these?');
      similar.forEach((u) => console.log(`      ${u.email}  (${u.role})`));
      console.log('');
    }
    console.log('    Create it:  npm run create:admin -- --email ' + email + ' --name "Your Name"\n');
    await mongoose.connection.close();
    process.exit(1);
  }

  console.log(`  Account: ${user.name} <${user.email}>`);
  console.log(`  Role   : ${user.role}${user.role === 'admin' ? '  → signs in and lands on /admin' :
                             user.role === 'spoc' ? '  → lands on /college' : '  → lands on /dashboard'}`);
  console.log(`  Active : ${user.isActive === false ? '✗ NO — this account is disabled' : '✓ yes'}`);
  console.log(`  Created: ${user.createdAt?.toISOString().slice(0, 10) || '—'}`);
  console.log(`  Password hash present: ${user.password ? '✓ yes' : '✗ NO — this account has no password!'}`);

  if (password) {
    const match = await user.matchPassword(password);
    console.log(`\n  Testing that password: ${match ? '✓ CORRECT — this login will work' : '✗ WRONG'}`);
    if (!match) {
      console.log('\n    The stored password is hashed and cannot be read back.');
      console.log('    Set a new one:');
      console.log(`      npm run create:admin -- --email ${email} --promote --password "NewPassword123"\n`);
      await mongoose.connection.close();
      process.exit(1);
    }
  } else {
    console.log('\n  Add --password "..." to test whether a password actually works.');
  }

  if (user.role !== 'admin') {
    console.log(`\n  ⚠ This account is a "${user.role}", not an admin — it cannot open /admin.`);
    console.log(`    Promote it:  npm run create:admin -- --email ${email} --promote`);
  }

  console.log('');
  await mongoose.connection.close();
};

run().catch(async (e) => {
  console.error('\n✗ ' + e.message + '\n');
  await mongoose.connection.close().catch(() => {});
  process.exit(1);
});
