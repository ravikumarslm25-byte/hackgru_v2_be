import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { signToken } from '../utils/token.js';
import { RegistrationLink } from '../models/org/RegistrationLink.js';
import { Batch } from '../models/org/Batch.js';
import { User } from '../models/User.js';
import { Order } from '../models/Order.js';
import { Enrollment } from '../models/Enrollment.js';
import { grantStudentAccessForLink } from '../services/org/batchAccess.js';
import { getRazorpay, isPaymentsEnabled } from '../config/razorpay.js';
import { CoursePrice } from '../models/org/CoursePrice.js';
import { issueOtp } from './authController.js';
import { notifyUser, notifyAdmins, notifyCollegeSpocs } from '../services/notify.js';

/**
 * Special registration links: /join/<token>
 *
 * College, department and course are fixed by the admin, so the student supplies
 * only their own details and pays. This is the ONLY public path that sets
 * User.college — which is what makes them visible to their college's portal.
 */

/** Load a link and everything the page needs to render. */
async function loadLink(token) {
  const link = await RegistrationLink.findOne({ token })
    .populate('college', 'name shortName code logo')
    .populate('department', 'name code')
    .populate('departments', 'name code')
    .populate('course', 'title slug tagline summary price mrp durationWeeks schedule mode level seats outcomes tools modules includes')
    .populate('batch', 'name code startDate status');
  if (!link) throw ApiError.notFound('This registration link is not valid. Please check the link and try again.');
  return link;
}

/**
 * What this student pays. One place, so the join page and the order can't disagree.
 *   link.priceOverride  →  CoursePrice (college deal)  →  course.price
 */
const priceFor = async (link) => {
  const { price } = await CoursePrice.resolve({
    courseId: link.course._id,
    collegeId: link.college?._id || null,
    coursePrice: link.course.price,
    linkOverride: link.priceOverride,
  });
  return price;
};

// @route GET /api/join/:token   (public, optionalAuth)
export const getJoinInfo = asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  const availability = link.availability();

  /**
   * Who's looking?
   *
   * A student who already has an account (they did a previous batch) must not be
   * shown a registration form that will 409. The page needs to know enough to
   * offer them one button instead.
   */
  let viewer = { loggedIn: false };
  if (req.user && req.user.role === 'student') {
    const enrolment = await Enrollment.findOne({ student: req.user._id, course: link.course._id })
      .populate('batch', 'code name').lean();
    viewer = {
      loggedIn: true,
      name: req.user.name,
      email: req.user.email,
      registerNumber: req.user.registerNumber || '',
      // A student belonging to a DIFFERENT college can't join an institutional link.
      collegeMismatch: Boolean(link.college && req.user.college && String(req.user.college) !== String(link.college._id)),
      enrolment: enrolment
        ? { exists: true, paid: Boolean(enrolment.paid), batchCode: enrolment.batch?.code || null,
            sameBatch: String(enrolment.batch?._id || '') === String(link.batch._id) }
        : null,
    };
  }

  ok(res, {
    viewer,
    open: availability.open,
    reason: availability.reason,
    seatsLeft: availability.seatsLeft ?? null,
    institutional: link.institutional !== false,
    college: link.college,
    department: link.department,
    departments: link.departments || [],
    course: link.course,
    batch: link.batch,
    price: await priceFor(link),
    mrp: link.course.mrp,
    freeAccess: Boolean(link.freeAccess),
    expiresAt: link.expiresAt,
    paymentsEnabled: isPaymentsEnabled(),
  });
});

// @route POST /api/join/:token/check   (public) — is this email already registered?
export const checkEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) throw ApiError.badRequest('Email is required');
  const exists = await User.exists({ email: String(email).toLowerCase().trim() });
  ok(res, { exists: Boolean(exists) });
});

/**
 * @route POST /api/join/:token   (public)
 * Creates the account AND the payment order in one call, and returns a JWT.
 *
 * Doing both together means checkout and verification then use the ordinary
 * authenticated payment path — and there's no "set your password" email that can
 * bounce and strand someone who has already paid.
 *
 * The seat is NOT claimed here. It's claimed on payment (see claimSeat), so an
 * abandoned form doesn't hold a seat hostage.
 */
export const join = asyncHandler(async (req, res) => {
  const { name, email, phone, password, registerNumber, year, departmentId, institution } = req.body;
  const link = await loadLink(req.params.token);
  const isInst = link.institutional !== false;

  const availability = link.availability();
  if (!availability.open) throw ApiError.badRequest(availability.reason);

  if (!name || !email || !password) throw ApiError.badRequest('Name, email and password are required.');
  if (isInst && !registerNumber) throw ApiError.badRequest('Your college register number is required.');
  if (String(password).length < 6) throw ApiError.badRequest('Password must be at least 6 characters.');

  // For an institutional link with several departments, the student picks theirs;
  // with one, it's fixed. Open links carry no department requirement.
  let department = null;
  if (isInst) {
    const allowed = (link.departments || []).map((d) => String(d._id || d));
    if (departmentId && allowed.includes(String(departmentId))) department = departmentId;
    else department = link.department?._id || (link.departments?.[0]?._id ?? null);
  }

  const cleanEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: cleanEmail });
  if (existing) {
    // Don't silently attach a stranger's registration to an existing account.
    throw ApiError.conflict('An account with this email already exists. Please log in first, then open this link again.');
  }

  const student = await User.create({
    name, email: cleanEmail, phone, password,
    role: 'student',
    emailVerified: false,
    // ── the college link. Only ever set for institutional links. ──
    college: isInst ? link.college._id : null,
    department: isInst ? department : null,
    registerNumber: registerNumber ? String(registerNumber).trim().toUpperCase() : '',
    year: year || '',
    registrationSource: 'link',
    registrationLink: link._id,
    // display convenience; not the visibility boundary. Open learners may type
    // their own institution/company, or leave it blank.
    institution: isInst ? link.college.name : (institution || ''),
  });

  // Hold the seat as before (an abandoned checkout still leaves them in the
  // batch), but DO NOT hand out a token yet — email must be verified first.
  const enrolment = await enrol({ student, link });

  // Notifications: for a free/sponsored link, access is already granted — no payment
  // prompt. Otherwise the seat is held pending payment.
  if (link.freeAccess) {
    notifyUser(student._id, { type: 'registration', title: 'You\'re enrolled', body: `Your access to ${link.course.title} is active. Start learning!`, link: '/dashboard' });
  } else {
    notifyUser(student._id, { type: 'payment_pending', title: 'Payment pending', body: `Your seat for ${link.course.title} is held. Complete payment to confirm.`, link: '/dashboard' });
  }
  if (link.college?._id) {
    notifyCollegeSpocs(link.college._id, { type: 'registration', title: 'New student registered', body: `${student.name} registered via your college link.`, link: '/college/students' });
  }
  notifyAdmins({ type: 'registration', title: 'New link registration', body: `${student.name} · ${link.college?.name || 'Open batch'}`, link: '/admin/students' });

  // Email the OTP. verify-email (in authController) completes it and returns a
  // token; the join page then proceeds to payment as a logged-in student.
  await issueOtp(student);

  ok(res, {
    needsVerification: true,
    email: student.email,
    user: { id: student._id, name: student.name, email: student.email, role: student.role },
    enrolment,
  }, 'Registered. Enter the code we emailed you to verify, then pay to confirm your seat.', 201);
});

/**
 * @route POST /api/join/:token/enrol   (authenticated)
 * For a student who already has an account.
 */
export const joinAsExisting = asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  const availability = link.availability();
  if (!availability.open) throw ApiError.badRequest(availability.reason);

  const student = req.user;
  const already = await Enrollment.findOne({ student: student._id, course: link.course._id });
  if (already) throw ApiError.conflict('You are already enrolled in this course.');

  // Attach them to the college if they aren't already. If they belong to a
  // DIFFERENT college, refuse — silently moving them would remove them from one
  // college's portal and add them to another's.
  if (link.college && student.college && String(student.college) !== String(link.college._id)) {
    throw ApiError.badRequest(
      'Your account is registered with a different college. Please contact HackGRU support.'
    );
  }
  if (link.college && !student.college) {
    student.college = link.college._id;
    student.department = link.department?._id || (link.departments?.[0]?._id ?? null);
    student.registrationSource = 'link';
    student.registrationLink = link._id;
    if (req.body.registerNumber) student.registerNumber = String(req.body.registerNumber).trim().toUpperCase();
    if (req.body.year) student.year = req.body.year;
    await student.save();
  }

  const enrolment = await enrol({ student, link });
  ok(res, { enrolment }, 'Registered. Your seat is held.', 201);
});

/**
 * Put the student in the batch. No payment involved.
 *
 * THE ENROLMENT IS CREATED HERE — before any money moves. Register now, pay now
 * or pay later; either way they're in the batch, their college can see them, and
 * their dashboard shows the course with payment outstanding. Payment only flips
 * `paid` to true (see services/org/enrolment.js).
 */
async function enrol({ student, link }) {
  const enrolment = await Enrollment.findOneAndUpdate(
    { student: student._id, course: link.course._id },
    {
      $setOnInsert: {
        student: student._id,
        course: link.course._id,
        batch: link.batch._id,
        registrationLink: link._id,
        paid: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, rawResult: true },
  );

  // Count a first-time registration only, not a returning student.
  if (enrolment.lastErrorObject?.updatedExisting === false) {
    await Batch.updateOne({ _id: link.batch._id }, { $inc: { 'stats.registered': 1 } });
  }

  // Free / college-sponsored link: grant the course's included access now, no payment.
  if (link.freeAccess) {
    try { await grantStudentAccessForLink(student._id, link); } catch { /* non-fatal */ }
  }

  const doc = enrolment.value || enrolment;
  return {
    id: doc._id, paid: Boolean(doc.paid),
    course: { id: link.course._id, title: link.course.title, slug: link.course.slug },
    batch: { id: link.batch._id, name: link.batch.name, code: link.batch.code },
    price: await priceFor(link),
  };
}

/**
 * @route POST /api/join/:token/pay   (authenticated)
 * Build the Razorpay order. Called from the "pay now" screen — never from
 * registration, so a student is never blocked at the door by a payment.
 */
export const payForJoin = asyncHandler(async (req, res) => {
  const link = await loadLink(req.params.token);
  const student = req.user;
  const amount = await priceFor(link);

  // They must already be registered — payment is the second step, never the first.
  const existing = await Enrollment.findOne({ student: student._id, course: link.course._id });
  if (!existing) throw ApiError.badRequest('Register for this batch first.');
  if (existing.paid) throw ApiError.conflict('This course is already paid for.');

  if (!isPaymentsEnabled()) {
    throw new ApiError(503, 'Payments are not switched on yet. Please contact HackGRU.');
  }

  const razorpay = await getRazorpay();
  const receipt = `join_${Date.now()}_${String(student._id).slice(-6)}`;
  const rzpOrder = await razorpay.orders.create({
    amount: amount * 100,
    currency: 'INR',
    receipt,
    notes: {
      courseId: String(link.course._id),
      courseTitle: link.course.title,
      studentId: String(student._id),
      batchId: String(link.batch._id),
      batchCode: link.batch.code,
      collegeCode: link.college?.code || 'OPEN',
    },
  });

  await Order.create({
    student: student._id,
    course: link.course._id,
    batch: link.batch._id,
    registrationLink: link._id,
    amount,
    currency: 'INR',
    razorpayOrderId: rzpOrder.id,
    receipt,
    notes: rzpOrder.notes,
  });

  ok(res, {
    order: {
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: env.razorpayKeyId,
    },
    course: { id: link.course._id, title: link.course.title, price: amount },
    batch: { id: link.batch._id, name: link.batch.name, code: link.batch.code },
  });
});
