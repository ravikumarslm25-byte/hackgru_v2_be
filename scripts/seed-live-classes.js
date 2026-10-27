/**
 * Seed the two example live classes — SAFE & IDEMPOTENT.
 *
 *   node scripts/seed-live-classes.js
 *
 * Creates (only if the slug doesn't already exist):
 *   1. ai-bot-building     — AI-Powered Bot Building for Your Business  (₹299)
 *   2. build-apps-with-ai  — Build the Application Using AI Assistance  (₹399)
 *
 * Each gets one weekend slot. Re-running changes nothing already created; edit
 * details afterwards from the admin panel (Live Classes).
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { LiveClass } from '../src/models/LiveClass.js';

const CLASSES = [
  {
    slug: 'ai-bot-building',
    title: 'AI-Powered Bot Building for Your Business',
    titleAccent: 'Your Business',
    tagline: 'Build a working AI chatbot that answers customers, captures leads and automates your FAQs — in one focused weekend, no heavy coding.',
    price: 299, mrp: 1499,
    startsOn: 'Sat, 2 Nov', timings: 'Sat & Sun · 2–4 PM',
    slots: [
      { date: 'Weekend Batch · 2–3 Nov', time: 'Sat & Sun · 2:00 PM – 4:00 PM', seatsTotal: 40, seatsLeft: 40, active: true },
    ],
  },
  {
    slug: 'build-apps-with-ai',
    title: 'Build the Application Using AI Assistance',
    titleAccent: 'Using AI Assistance',
    tagline: 'Go from idea to a working application with AI as your co-developer — no heavy coding, build along live in one weekend.',
    price: 399, mrp: 1999,
    startsOn: 'Sat, 2 Nov', timings: 'Sat & Sun · 10 AM–12 PM',
    slots: [
      { date: 'Weekend Batch · 2–3 Nov', time: 'Sat & Sun · 10:00 AM – 12:00 PM', seatsTotal: 40, seatsLeft: 40, active: true },
    ],
  },
];

async function run() {
  await mongoose.connect(env.mongoUri);
  for (const c of CLASSES) {
    const exists = await LiveClass.findOne({ slug: c.slug });
    if (exists) { console.log(`  = "${c.title}" already exists (/live/${c.slug})`); continue; }
    await LiveClass.create(c);
    console.log(`  + "${c.title}"  →  /live/${c.slug}`);
  }
  await mongoose.disconnect();
  console.log('✓ live classes seeded');
  process.exit(0);
}

run().catch((e) => { console.error('✗ seed failed:', e); process.exit(1); });
