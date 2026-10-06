/**
 * Seed the database with starter data.
 * Run:  npm run seed
 */
import mongoose from 'mongoose';
import { connectDB, isRemoteUri } from '../config/db.js';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { Program } from '../models/Program.js';
import { Course } from '../models/Course.js';
import { Enrollment } from '../models/Enrollment.js';
import { Testimonial } from '../models/Testimonial.js';
import { Order } from '../models/Order.js';
import { coursesData } from './courses.data.js';
import { seedSsat } from './ssat/seedSsat.js';

const programs = [
  {
    title: 'Technical Training', slug: 'technical', category: 'technical',
    tagline: 'Master 40+ industry technologies',
    description: 'MERN Stack, AI/ML, Cloud Computing, AR/VR and Mobile Development taught live through real projects.',
    technologies: ['MERN', 'Python', 'AI/ML', 'Cloud', 'Java', 'AR/VR', 'Mobile'],
    durationWeeks: 24, level: 'intermediate',
    highlights: ['Live mentor-led sessions', 'Industry expert faculty', 'Portfolio projects', 'Placement support'],
  },
  {
    title: 'Soft Skills Training', slug: 'non-technical', category: 'non-technical',
    tagline: 'Communication, leadership & interview skills',
    description: 'Build the communication, teamwork and professional skills that get you shortlisted and hired.',
    technologies: ['Communication', 'Aptitude', 'Group Discussion', 'Interviews', 'Leadership'],
    durationWeeks: 8, level: 'beginner',
    highlights: ['Mock interviews', 'Aptitude preparation', 'Personality development', 'Resume clinic'],
  },
  {
    title: 'Company-Specific Training', slug: 'company-specific', category: 'company-specific',
    tagline: 'Targeted preparation for your dream company',
    description: 'Company-specific patterns, rounds and mock interviews for the roles you actually want.',
    technologies: ['DSA', 'System Design', 'Company Patterns', 'Mock Rounds'],
    durationWeeks: 12, level: 'advanced',
    highlights: ['Company-wise patterns', 'Real interview rounds', 'Referral guidance'],
  },
];

const testimonials = [
  { name: 'Dr. Rajesh Kumar', role: 'Dean, Engineering College', avatarInitials: 'DR', rating: 5,
    quote: "HackGRU's training transformed our students' career prospects. Our placement rate increased by 45% in just one year. The faculty is exceptional!" },
  { name: 'Priya Sharma', role: 'Software Engineer, Amazon', avatarInitials: 'PS', rating: 5,
    quote: 'The SSAT helped me identify my weaknesses and the personalized roadmap got me placed at Amazon. Best investment in my career!' },
  { name: 'Arjun Menon', role: 'Full Stack Developer, TCS', avatarInitials: 'AM', rating: 5,
    quote: 'The hands-on projects and industry-relevant curriculum gave me the confidence to crack my dream company interview. Highly recommended!' },
];

const run = async () => {
  // SAFETY: this script calls deleteMany({}) on every collection. Pointed at a
  // production database that is total, unrecoverable data loss. Refuse by default.
  if (isRemoteUri(env.mongoUri) && process.env.SEED_ALLOW_REMOTE !== 'true') {
    console.error('\n✗ Refusing to seed a REMOTE database.\n');
    console.error('   MONGO_URI is not a local database, and `npm run seed` DELETES ALL DATA');
    console.error('   in every collection (users, courses, orders, enrolments, SSAT results).');
    console.error('');
    console.error('   If you are certain — e.g. first-time setup of an empty cluster — run:');
    console.error('     SEED_ALLOW_REMOTE=true npm run seed          (Mac/Linux)');
    console.error('     set SEED_ALLOW_REMOTE=true && npm run seed   (Windows CMD)');
    console.error('     $env:SEED_ALLOW_REMOTE="true"; npm run seed  (PowerShell)\n');
    process.exit(1);
  }

  await connectDB();
  console.log('Clearing existing data…');
  await Promise.all([
    User.deleteMany({}), Program.deleteMany({}), Course.deleteMany({}),
    Enrollment.deleteMany({}), Testimonial.deleteMany({}), Order.deleteMany({}),
  ]);

  const createdPrograms = await Program.create(programs);
  await Testimonial.create(testimonials);
  console.log(`✓ ${createdPrograms.length} programs, ${testimonials.length} testimonials`);

  // All three cohorts sit under the Technical program
  const technical = createdPrograms.find((p) => p.slug === 'technical');
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 14); // next cohort starts in 2 weeks

  const courses = [];
  for (const data of coursesData) {
    // .create() one-by-one so the pre('save') hook computes totalLessons
    courses.push(await Course.create({ ...data, program: technical._id, startDate }));
  }
  console.log(`✓ ${courses.length} courses: ${courses.map((c) => c.slug).join(', ')}`);

  const admin = await User.create({
    name: 'HackGRU Admin', email: 'admin@hackgru.com', password: 'admin123', role: 'admin',
  });
  const student = await User.create({
    name: 'Demo Student', email: 'student@hackgru.com', password: 'student123',
    role: 'student', track: 'technical', institution: 'Anna University', phone: '+91 90000 00000',
  });

  // Give the demo student a head start so the dashboard has something to show
  await Enrollment.create({
    student: student._id, course: courses[0]._id, progress: 35,
    completedLessons: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7'],
  });
  await Enrollment.create({
    student: student._id, course: courses[2]._id, progress: 72,
    completedLessons: Array.from({ length: 13 }, (_, i) => `v${i + 1}`),
  });

  await seedSsat({ clearSessions: true });

  console.log('✓ Seed complete');
  console.log('  Admin:   admin@hackgru.com / admin123');
  console.log('  Student: student@hackgru.com / student123');
  await mongoose.connection.close();
  process.exit(0);
};

run().catch((e) => { console.error(e); process.exit(1); });
