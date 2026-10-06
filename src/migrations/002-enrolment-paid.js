#!/usr/bin/env node
/**
 * Migration 002 — separate enrolment from payment.
 *   npm run migrate:002            (dry run)
 *   npm run migrate:002 -- --apply
 *
 * Before this change an Enrolment was only ever created on payment, so every
 * existing one is paid. They get paid:true.
 *
 * It also repairs the case that prompted the change: a student who registered
 * through a link, abandoned checkout, and therefore has a User + Order but no
 * Enrolment. They were invisible in the batch with no way back. This creates the
 * missing enrolment as unpaid, so they appear in the roster and can finish
 * paying from their dashboard.
 *
 * Idempotent. Safe to run twice.
 */
import mongoose from 'mongoose';
import { connectDB, isRemoteUri } from '../config/db.js';
import { env } from '../config/env.js';
import { Enrollment } from '../models/Enrollment.js';
import { Order } from '../models/Order.js';

const apply = process.argv.includes('--apply');

const run = async () => {
  await connectDB();
  console.log(`\nMigration 002 — enrolment / payment split  [${apply ? 'APPLY' : 'DRY RUN'}]`);
  if (isRemoteUri(env.mongoUri)) console.log('⚠  Target is a REMOTE database.\n');

  const needsPaid = await Enrollment.countDocuments({ paid: { $exists: false } });

  // Orders that never completed, whose student has no enrolment for that course.
  const orphans = await Order.aggregate([
    { $match: { status: { $ne: 'paid' }, batch: { $ne: null } } },
    { $lookup: {
        from: 'enrollments',
        let: { s: '$student', c: '$course' },
        pipeline: [{ $match: { $expr: { $and: [{ $eq: ['$student', '$$s'] }, { $eq: ['$course', '$$c'] }] } } }],
        as: 'enrol',
    } },
    { $match: { enrol: { $size: 0 } } },
  ]);

  console.log(`  existing enrolments missing 'paid'      : ${needsPaid}  → paid:true (they only existed if paid)`);
  console.log(`  abandoned link registrations with no enrolment: ${orphans.length}  → create as unpaid`);

  if (orphans.length) {
    console.log('\n  These students registered via a link but never finished paying:');
    orphans.slice(0, 10).forEach((o) =>
      console.log(`    student ${o.student} · course ${o.course} · batch ${o.batch} · ${o.status}`));
    if (orphans.length > 10) console.log(`    …and ${orphans.length - 10} more`);
  }

  if (!apply) {
    console.log('\n  Dry run — nothing written. Re-run with:  npm run migrate:002 -- --apply\n');
    await mongoose.connection.close();
    return;
  }

  const r1 = await Enrollment.updateMany(
    { paid: { $exists: false } },
    { $set: { paid: true, paidAt: null } },
  );
  console.log(`\n  ✓ ${r1.modifiedCount} existing enrolment(s) marked paid`);

  let created = 0;
  for (const o of orphans) {
    const res = await Enrollment.updateOne(
      { student: o.student, course: o.course },
      { $setOnInsert: {
          student: o.student, course: o.course, batch: o.batch,
          registrationLink: o.registrationLink || null, paid: false,
      } },
      { upsert: true },
    );
    if (res.upsertedCount) created += 1;
  }
  console.log(`  ✓ ${created} unpaid enrolment(s) created — those students now appear in their batch`);
  console.log('    and can complete payment from their dashboard.\n');

  await mongoose.connection.close();
};

run().catch((e) => { console.error(e); process.exit(1); });
