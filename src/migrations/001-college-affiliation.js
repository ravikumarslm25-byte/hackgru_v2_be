#!/usr/bin/env node
/**
 * Migration 001 — college affiliation.
 *   npm run migrate:001            (dry run — shows what it would do)
 *   npm run migrate:001 -- --apply (writes)
 *
 * Every existing user gets:
 *   college            = null   ← deliberately
 *   registrationSource = 'website'
 *
 * WHY college = null AND NOT a best-effort match on the free-text `institution`:
 * matching "anna univ" / "Anna University, Chennai" / "AU" to a College record is
 * guesswork, and a wrong guess exposes a student to a college that has no
 * relationship with them. Null is the safe default — those students stay
 * invisible to every college portal, exactly as they are today. Link
 * registrations from here on set it properly; anyone who genuinely belongs to a
 * college can be attached by an admin, deliberately.
 *
 * Idempotent. Safe to run twice.
 */
import mongoose from 'mongoose';
import { connectDB, isRemoteUri } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';

const apply = process.argv.includes('--apply');

const run = async () => {
  await connectDB();
  console.log(`\nMigration 001 — college affiliation  [${apply ? 'APPLY' : 'DRY RUN'}]`);
  if (isRemoteUri(env.mongoUri)) console.log('⚠  Target is a REMOTE database.\n');

  const needsSource = await User.countDocuments({ registrationSource: { $exists: false } });
  const needsCollege = await User.countDocuments({ college: { $exists: false } });
  const withInstitution = await User.countDocuments({ institution: { $nin: ['', null] } });
  const total = await User.countDocuments();

  console.log(`  users total                        : ${total}`);
  console.log(`  missing registrationSource         : ${needsSource}  → 'website'`);
  console.log(`  missing college field              : ${needsCollege}  → null`);
  console.log(`  have free-text institution         : ${withInstitution}  → left alone, NOT auto-matched`);

  if (!apply) {
    console.log('\n  Dry run — nothing written. Re-run with:  npm run migrate:001 -- --apply\n');
    await mongoose.connection.close();
    return;
  }

  const res = await User.updateMany(
    { $or: [{ registrationSource: { $exists: false } }, { college: { $exists: false } }] },
    {
      $set: { registrationSource: 'website', college: null, department: null, registrationLink: null },
    }
  );
  console.log(`\n  ✓ updated ${res.modifiedCount} user(s)`);

  const leaked = await User.countDocuments({ college: { $ne: null }, registrationSource: 'website' });
  console.log(`  ✓ website-registered users with a college link: ${leaked} (expected 0)`);
  if (leaked > 0) console.error('  ✗ CHECK THIS — a website registration should not carry a college.');

  console.log('');
  await mongoose.connection.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
