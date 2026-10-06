/**
 * Seed a demo Software Engineering End-Semester exam (Sathyabama format) plus a set
 * of realistic student attempts — so the exam, result screen and proctoring reports
 * all have data for a live demo.
 *
 * Usage (from the server/ folder):
 *   node scripts/seed-se-exam.mjs ["<course title or id>"]
 * Defaults the course match to "Software". Safe to re-run — it replaces the demo
 * test and its demo attempts each time.
 */
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { User } from '../src/models/User.js';
import { Course } from '../src/models/Course.js';
import { Enrollment } from '../src/models/Enrollment.js';
import { Test } from '../src/models/Test.js';
import { TestAttempt } from '../src/models/TestAttempt.js';

const oid = () => new mongoose.Types.ObjectId();
const TITLE = 'Software Engineering — End Semester Examination';

await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });

const courseArg = process.argv[2] || 'Software';
let course = mongoose.isValidObjectId(courseArg) ? await Course.findById(courseArg) : null;
if (!course) course = await Course.findOne({ title: new RegExp(courseArg, 'i') });
if (!course) {
  const all = await Course.find().select('title').lean();
  console.error(`✗ No course matching "${courseArg}". Available: ${all.map((c) => `"${c.title}"`).join(', ') || '(none)'}`);
  process.exit(1);
}

/* ─── Question bank ─── */
const S_FILL = oid(), S_MCQ = oid(), S_DESC = oid();
const fill = [
  ['The process of gathering, analysing and documenting what a system must do is called ______ engineering.', ['requirements', 'requirement']],
  ['A ______ diagram in UML captures the interactions between actors and the system\u2019s use cases.', ['use case', 'usecase']],
  ['The SDLC model that repeats phases in iterations, each preceded by risk analysis, is the ______ model.', ['spiral']],
  ['______ testing verifies the smallest individual components of software in isolation.', ['unit']],
  ['The measure of how strongly the elements within a single module belong together is called ______.', ['cohesion']],
  ['The degree of interdependence between two software modules is called ______.', ['coupling']],
  ['A ______ diagram shows the time-ordered sequence of messages exchanged between objects.', ['sequence']],
  ['______ integration is the practice of merging developer changes frequently and running automated builds and tests.', ['continuous', 'ci']],
  ['A ______ (abbr. DFD) graphically represents the flow of data through a system.', ['data flow diagram', 'dfd', 'data flow']],
  ['The software estimation technique that measures functionality delivered to the user is ______ point analysis.', ['function', 'function point']],
];
const mcq = [
  ['Which SDLC model is best suited when requirements are well understood and stable?',
    [['Waterfall model', true], ['Spiral model', false], ['Agile model', false], ['RAD model', false]]],
  ['Which of the following is a NON-functional requirement?',
    [['The system shall respond within 2 seconds', true], ['The system shall allow users to log in', false], ['The system shall generate invoices', false], ['The system shall let admins add courses', false]]],
  ['Good software design aims for cohesion that is ____ and coupling that is ____.',
    [['high, low', true], ['low, high', false], ['high, high', false], ['low, low', false]]],
  ['Which of these UML diagrams is a STRUCTURAL diagram?',
    [['Class diagram', true], ['Sequence diagram', false], ['Use case diagram', false], ['Activity diagram', false]]],
  ['In the Spiral model, every loop must include a phase of ____.',
    [['Risk analysis', true], ['User training', false], ['Marketing', false], ['Data entry', false]]],
  ['Testing the complete, integrated system against its requirements is called ____ testing.',
    [['System', true], ['Unit', false], ['Smoke', false], ['Alpha', false]]],
  ['The Agile Manifesto values ____ over comprehensive documentation.',
    [['Working software', true], ['Detailed contracts', false], ['Fixed plans', false], ['Formal sign-off', false]]],
  ['Which activity re-runs earlier tests to ensure new changes did not break existing behaviour?',
    [['Regression testing', true], ['Acceptance testing', false], ['Load testing', false], ['Usability testing', false]]],
  ['Which of the following is a distributed version control system?',
    [['Git', true], ['SVN (centralised)', false], ['FTP', false], ['HTTP', false]]],
  ['Which phase of the SDLC translates the design into executable code?',
    [['Implementation / coding', true], ['Requirement analysis', false], ['Maintenance', false], ['Deployment', false]]],
];
const desc = [
  'Explain the Waterfall model of software development. List its phases in order and discuss its main advantages and disadvantages with a suitable example.',
  'Describe the Agile methodology. Compare Agile with the traditional Waterfall approach across at least four dimensions (requirements, delivery, customer involvement, and handling of change).',
  'Define coupling and cohesion. Explain the different types of each and discuss how they influence the maintainability and quality of a software design.',
  'Discuss the four levels of software testing (unit, integration, system and acceptance). For each level, state its purpose and give one practical example.',
];

const questions = [
  ...fill.map((f, i) => ({ _id: oid(), text: f[0], type: 'fill_blank', section: S_FILL, marks: 2, acceptedAnswers: f[1], order: i })),
  ...mcq.map((m, i) => ({ _id: oid(), text: m[0], type: 'single', section: S_MCQ, marks: 1, order: 10 + i,
    options: m[1].map(([t, c]) => ({ _id: oid(), text: t, isCorrect: !!c })) })),
  ...desc.map((d, i) => ({ _id: oid(), text: d, type: 'paragraph', section: S_DESC, marks: 10, order: 20 + i })),
];
const sections = [
  { _id: S_FILL, title: 'Fill in the blank', marksPerQuestion: 2, answerCount: 10, order: 0 },
  { _id: S_MCQ, title: 'Multiple choice questions', marksPerQuestion: 1, answerCount: 10, order: 1 },
  { _id: S_DESC, title: 'Descriptive Questions', marksPerQuestion: 10, answerCount: 2, order: 2 },
];

await Test.deleteMany({ course: course._id, title: TITLE });
const test = await Test.create({
  course: course._id, title: TITLE,
  description: 'AI-proctored end semester examination for the Software Engineering course. Duration 180 minutes. Maximum 50 marks. Answer all questions in Sections 1 & 2 and any 2 of 4 in Section 3.',
  durationMin: 180, passPercent: 40, attemptsAllowed: 0, isFree: true, isPublished: true,
  proctoring: { enabled: true, faceTracking: true, idVerification: true, browserLock: true, maxViolations: 3, lookAwaySeconds: 3, terminateOnMax: false },
  sections, questions,
});
const fillQs = questions.filter((q) => q.type === 'fill_blank');
const mcqQs = questions.filter((q) => q.type === 'single');
const descQs = questions.filter((q) => q.type === 'paragraph');
console.log(`\u2713 Test created: "${TITLE}"  (${questions.length} questions, ${test.totalMarks} marks) in course "${course.title}"`);

const SAMPLE_DESC = [
  'The Waterfall model is a linear sequential model with phases: Requirements, Design, Implementation, Testing, Deployment and Maintenance. Each phase completes before the next begins. Advantages: simple, well documented, easy to manage for stable requirements. Disadvantages: inflexible to change, working software appears late, risky for evolving requirements. Example: payroll systems with fixed rules.',
  'Agile delivers software in short iterations (sprints) with continuous customer feedback and welcomes changing requirements. Compared to Waterfall: requirements evolve vs fixed upfront; delivery is incremental vs single big-bang; customer involvement is continuous vs mainly at start/end; change is embraced vs costly and discouraged.',
  'Coupling is the interdependence between modules; cohesion is how related the responsibilities inside a module are. Low coupling and high cohesion are desired. Types of coupling include data, stamp, control and content; cohesion ranges from coincidental to functional. High cohesion and low coupling improve maintainability, reusability and testability.',
];

/* ─── Attempt builder ─── */
function buildAnswers({ fillCorrect, mcqCorrect, descGrades, descAnswered = 2 }) {
  const answers = [];
  fillQs.forEach((q, i) => { const ok = i < fillCorrect; answers.push({ question: q._id, section: S_FILL, text: ok ? q.acceptedAnswers[0] : 'not sure', correct: ok, awarded: ok ? 2 : 0, counted: true }); });
  mcqQs.forEach((q, i) => { const ok = i < mcqCorrect; const c = q.options.find((o) => o.isCorrect), w = q.options.find((o) => !o.isCorrect); answers.push({ question: q._id, section: S_MCQ, selected: [ok ? c._id : w._id], correct: ok, awarded: ok ? 1 : 0, counted: true }); });
  const pending = descGrades === null;
  const graded = [];
  descQs.forEach((q, i) => {
    if (i < descAnswered) { const g = pending ? 0 : (descGrades[i] ?? 0); graded.push({ question: q._id, section: S_DESC, text: SAMPLE_DESC[i] || SAMPLE_DESC[0], correct: g > 0, awarded: g, needsReview: pending }); }
    else answers.push({ question: q._id, section: S_DESC, text: '', correct: false, awarded: 0, needsReview: false, counted: false });
  });
  // best-N (2) counted among answered descriptive
  const ranked = graded.slice().sort((a, b) => (b.awarded || 0) - (a.awarded || 0));
  ranked.forEach((a, idx) => { a.counted = idx < 2; answers.push(a); });
  const score = answers.reduce((n, a) => n + (a.counted ? Math.max(0, a.awarded || 0) : 0), 0);
  const needsReview = answers.some((a) => a.needsReview);
  return { answers, score, needsReview };
}
const V = (type, detail, mins) => ({ type, detail, at: null, _mins: mins });

const roster = [
  { name: 'Arjun Ramesh', email: 'demo.arjun@hackgru.test', reg: 'SB21CS001',
    spec: { fillCorrect: 9, mcqCorrect: 8, descGrades: [9, 8] }, status: 'submitted', flagged: false, violations: [], dur: 5400 },
  { name: 'Priya Nair', email: 'demo.priya@hackgru.test', reg: 'SB21CS014',
    spec: { fillCorrect: 8, mcqCorrect: 9, descGrades: [8, 7] }, status: 'submitted', flagged: false, violations: [V('looking_away', 'Brief look-away from screen', 22)], dur: 6100 },
  { name: 'Karthik Subramani', email: 'demo.karthik@hackgru.test', reg: 'SB21CS027',
    spec: { fillCorrect: 6, mcqCorrect: 5, descGrades: [6, 5] }, status: 'flagged', flagged: true,
    violations: [V('looking_away', 'Sustained look-away from screen', 12), V('tab_switch', 'Switched away from the exam tab', 34), V('shortcut', 'Ctrl/Cmd+C blocked', 41)], dur: 6600 },
  { name: 'Divya Lakshmi', email: 'demo.divya@hackgru.test', reg: 'SB21CS039',
    spec: { fillCorrect: 7, mcqCorrect: 6, descGrades: null }, status: 'submitted', flagged: false, violations: [], dur: 5900 },
  { name: 'Mohammed Irfan', email: 'demo.irfan@hackgru.test', reg: 'SB21CS052',
    spec: { fillCorrect: 3, mcqCorrect: 4, descGrades: [3, 2] }, status: 'submitted', flagged: false, violations: [V('no_face', 'No face detected in frame', 48)], dur: 4200 },
  { name: 'Sneha Iyer', email: 'demo.sneha@hackgru.test', reg: 'SB21CS061',
    spec: { fillCorrect: 5, mcqCorrect: 7, descGrades: [7, 4] }, status: 'terminated', flagged: true,
    violations: [V('multiple_faces', 'More than one face detected', 8), V('multiple_faces', 'More than one face detected', 19), V('tab_switch', 'Exam window lost focus', 26), V('paste', 'Paste blocked', 33)], dur: 2100, terminatedReason: 'Exceeded violation limit' },
];

await TestAttempt.deleteMany({ test: test._id });
let made = 0;
for (const r of roster) {
  let u = await User.findOne({ email: r.email });
  if (!u) u = await new User({ name: r.name, email: r.email, password: 'demo1234', role: 'student', registerNumber: r.reg, source: 'admin' }).save();
  await Enrollment.findOneAndUpdate({ student: u._id, course: course._id },
    { $set: { paid: true, sponsored: true, status: 'active', paidAt: new Date() } }, { upsert: true, setDefaultsOnInsert: true });

  const { answers, score, needsReview } = buildAnswers(r.spec);
  const maxScore = 50;
  const percent = (score / maxScore) * 100;
  const passed = !needsReview && percent >= test.passPercent;
  const startedAt = new Date(Date.now() - (r.dur + 300) * 1000);
  const violations = r.violations.map((v) => ({ type: v.type, detail: v.detail, screenshot: null, at: new Date(startedAt.getTime() + (v._mins || 1) * 60000) }));

  await TestAttempt.create({
    student: u._id, course: course._id, test: test._id, answers,
    score, maxScore, percent, passed, needsReview,
    status: r.status, proctored: true, startedAt, submittedAt: new Date(startedAt.getTime() + r.dur * 1000), durationTakenSec: r.dur,
    proctoring: { idFace: null, idCard: null, verifiedAt: startedAt, violations, flagged: r.flagged, terminatedReason: r.terminatedReason || '' },
  });
  made++;
}
console.log(`\u2713 ${made} demo student attempts created (clean, flagged, pending-grading, failed & terminated).`);
console.log('  Demo logins: any demo.<name>@hackgru.test  /  password: demo1234');
console.log('  Open Admin \u2192 Tests \u2192 shield icon on the Software Engineering test to see the reports.');
await mongoose.disconnect();
process.exit(0);
