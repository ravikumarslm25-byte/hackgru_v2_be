/**
 * Enroll a student in a course WITHOUT payment — for testing (e.g. the proctored exam).
 * Creates a sponsored+paid enrolment, which satisfies course access checks.
 *
 * Usage (run from the server/ folder):
 *   node scripts/enroll-test-student.mjs <studentEmail> "<course title or id>"
 *
 * Example:
 *   node scripts/enroll-test-student.mjs ravipromake@gmail.com "MERN"
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Course } from '../src/models/Course.js';
import { Enrollment } from '../src/models/Enrollment.js';

const [, , email, courseArg] = process.argv;
if (!email || !courseArg) {
  console.error('Usage: node scripts/enroll-test-student.mjs <studentEmail> "<course title or id>"');
  process.exit(1);
}

await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });

const user = await User.findOne({ email: new RegExp(`^${email}$`, 'i') });
if (!user) { console.error(`✗ No user with email "${email}"`); process.exit(1); }

let course = mongoose.isValidObjectId(courseArg) ? await Course.findById(courseArg) : null;
if (!course) course = await Course.findOne({ title: new RegExp(courseArg, 'i') });
if (!course) { console.error(`✗ No course matching "${courseArg}"`); process.exit(1); }

const enr = await Enrollment.findOneAndUpdate(
  { student: user._id, course: course._id },
  { $set: { paid: true, sponsored: true, status: 'active', paidAt: new Date() } },
  { new: true, upsert: true, setDefaultsOnInsert: true }
);

console.log(`✓ Enrolled "${user.name || user.email}" in "${course.title}"  (enrolment ${enr._id})`);
console.log('  Now mark the test as "Free" in the admin builder, publish it, and the student can take it.');
await mongoose.disconnect();
process.exit(0);
