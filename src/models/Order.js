import mongoose from 'mongoose';

/** A payment order for a course (Razorpay). */
const orderSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    /** v1 single-course orders set this; v2 product/cart orders leave it null. */
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
    /** 'course' = the v1 enrolment flow; 'cart' = v2 product purchase (see items). */
    type: { type: String, enum: ['course', 'cart'], default: 'course' },
    /** v2 cart line items — each maps to a Product whose grants become entitlements. */
    items: [{
      product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      title: String,
      kind: String,
      price: Number,
    }],
    /** Set once a cart order's entitlements have been granted (idempotency guard). */
    fulfilledAt: { type: Date, default: null },
    /**
     * Set when the purchase came through a special registration link. The
     * enrolment created on payment inherits this batch — which is what puts the
     * student in their college's portal. Null for a public website purchase.
     */
    batch: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null, index: true },
    registrationLink: { type: mongoose.Schema.Types.ObjectId, ref: 'RegistrationLink', default: null },
    amount: { type: Number, required: true },            // in INR (rupees)
    currency: { type: String, default: 'INR' },
    razorpayOrderId: { type: String, index: true },
    razorpayPaymentId: { type: String },
    /** How they paid: upi / card / netbanking / wallet. From Razorpay. */
    method: { type: String, default: '' },
    /** e.g. "HDFC •••• 4242" or a UPI handle — whatever Razorpay gives us. */
    methodDetail: { type: String, default: '' },
    razorpaySignature: { type: String },
    status: {
      type: String,
      enum: ['created', 'paid', 'failed', 'refunded', 'cancelled'],
      default: 'created',
    },
    receipt: { type: String },
    /** Guards the seat claim against double-counting when both the browser
     *  verify and the webhook fire for the same payment. */
    seatClaimed: { type: Boolean, default: false },
    /** Set when the payment-confirmation email has been sent, so a webhook
     *  replay or the browser verify firing second doesn't email twice. */
    confirmationEmailSentAt: { type: Date, default: null },
    notes: { type: Object, default: {} },
    /** Offline/manual payment: proof file + who recorded it (admin). */
    proof: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
    manuallyMarkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    refund: {
      requestedAt: Date,
      processedAt: Date,
      amount: Number,
      reason: String,
    },
  },
  { timestamps: true }
);

export const Order = mongoose.model('Order', orderSchema);
