/**
 * v2 Phase 0 migration — SAFE & IDEMPOTENT. Run once per environment.
 *
 *   node scripts/migrate-v2-phase0.js
 *
 * Does three things, none destructive:
 *   1. Creates Streams from the 3 program categories (technical / non-technical /
 *      company-specific), and a Track per existing Program under its Stream.
 *   2. Sets course.track from each course's program (courses with no program get a
 *      default "General" Stream/Track).
 *   3. Backfills Entitlements: every paid Enrollment → a live_cohort entitlement.
 *
 * Re-running it changes nothing already done.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { Stream } from '../src/models/Stream.js';
import { Track } from '../src/models/Track.js';
import { Program } from '../src/models/Program.js';
import { Course } from '../src/models/Course.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { grantEntitlement } from '../src/services/access/entitlements.js';

const STREAMS = {
  technical: { name: 'Technical Training', slug: 'technical-training', order: 1 },
  'non-technical': { name: 'Soft Skills', slug: 'soft-skills', order: 2 },
  'company-specific': { name: 'Company-Specific', slug: 'company-specific', order: 3 },
  general: { name: 'General', slug: 'general', order: 9 },
};

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function upsertStream(key) {
  const def = STREAMS[key] || STREAMS.general;
  let s = await Stream.findOne({ slug: def.slug });
  if (!s) { s = await Stream.create(def); console.log(`  + Stream "${def.name}"`); }
  return s;
}

async function upsertTrack(stream, name, slug) {
  let t = await Track.findOne({ stream: stream._id, slug });
  if (!t) { t = await Track.create({ stream: stream._id, name, slug }); console.log(`    + Track "${name}"`); }
  return t;
}

async function run() {
  await mongoose.connect(env.mongoUri);
  console.log('Connected. Running v2 Phase 0 migration…\n');

  // 1 + 2. Streams/Tracks from programs, then assign course.track.
  console.log('Taxonomy:');
  const programs = await Program.find().lean();
  const trackByProgram = {};
  for (const p of programs) {
    const stream = await upsertStream(p.category);
    const track = await upsertTrack(stream, p.title, slugify(p.slug || p.title));
    trackByProgram[String(p._id)] = track._id;
  }
  const generalStream = await upsertStream('general');
  const generalTrack = await upsertTrack(generalStream, 'General', 'general');

  const courses = await Course.find().select('_id title program track').lean();
  let assigned = 0;
  for (const c of courses) {
    if (c.track) continue; // already assigned
    const trackId = (c.program && trackByProgram[String(c.program)]) || generalTrack._id;
    await Course.updateOne({ _id: c._id }, { $set: { track: trackId } });
    assigned++;
  }
  console.log(`  → ${assigned} course(s) assigned a track (of ${courses.length}).\n`);

  // 3. Backfill entitlements from paid enrolments.
  console.log('Entitlements:');
  const paid = await Enrollment.find({ paid: true }).select('student course batch registrationLink').lean();
  let granted = 0;
  for (const e of paid) {
    await grantEntitlement({
      student: e.student, kind: 'live_cohort', course: e.course, batch: e.batch || null,
      source: e.registrationLink ? 'college_link' : 'purchase',
    });
    granted++;
  }
  console.log(`  → ${granted} live_cohort entitlement(s) ensured (from ${paid.length} paid enrolments).\n`);

  console.log('✓ Phase 0 migration complete.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => { console.error('✗ migration failed:', e); process.exit(1); });
