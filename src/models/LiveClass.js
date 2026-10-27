import mongoose from 'mongoose';

/**
 * A LiveClass is a standalone, lead-generating landing page for one of Ravi's
 * online live classes — separate from the college LMS catalogue (Course/Program).
 *
 * Each class lives at its OWN public URL: /live/<slug>. Two classes never share
 * a page. The admin creates the class (title, price, highlights) and one or more
 * weekend SLOTS (dates/times/seats) that the visitor picks before paying.
 *
 * Registrations are kept in their own collection (LiveRegistration), one list
 * per class — so the admin sees a separate roster for every course.
 */

const slotSchema = new mongoose.Schema(
  {
    // Human label shown on the page, e.g. "Weekend Batch · 2–3 Nov".
    date: { type: String, required: true, trim: true },
    // Human label for timings, e.g. "Sat & Sun · 2:00 PM – 4:00 PM".
    time: { type: String, required: true, trim: true },
    // Optional real start datetime (for sorting / reminders later).
    startAt: { type: Date, default: null },
    seatsTotal: { type: Number, default: 40, min: 0 },
    seatsLeft: { type: Number, default: null, min: 0 },
    active: { type: Boolean, default: true },
  },
  { _id: true, timestamps: false }
);

// A new slot starts full unless seatsLeft was given explicitly.
slotSchema.pre('validate', function (next) {
  if (this.seatsLeft == null) this.seatsLeft = this.seatsTotal;
  next();
});

const highlightSchema = new mongoose.Schema(
  { title: { type: String, required: true, trim: true }, body: { type: String, default: '', trim: true } },
  { _id: false }
);
const statSchema = new mongoose.Schema(
  { value: { type: String, required: true, trim: true }, label: { type: String, default: '', trim: true } },
  { _id: false }
);
const faqSchema = new mongoose.Schema(
  { q: { type: String, required: true, trim: true }, a: { type: String, default: '', trim: true } },
  { _id: false }
);

// Sensible defaults so a freshly created class already has a complete page;
// the admin only has to set title, price and slots to go live.
const DEFAULT_HIGHLIGHTS = [
  { title: 'Build your own AI bot', body: 'Create a bot trained on your business — products, pricing, FAQs — using AI and no-code tools.' },
  { title: 'Go live on WhatsApp & web', body: 'Connect your bot to WhatsApp and embed it on your site to answer customers 24/7.' },
  { title: 'Capture & qualify leads', body: 'Turn chats into leads — collect details automatically and never miss an enquiry again.' },
  { title: 'No coding needed', body: 'Built for beginners & business owners. Step-by-step, live, with everything explained simply.' },
  { title: 'Automate the busywork', body: 'Let the bot handle repetitive questions so you and your team focus on real work.' },
  { title: 'Certificate + recordings', body: 'Get a HackGRU certificate and lifetime access to the session recordings.' },
];
const DEFAULT_STATS = [
  { value: '30,000+', label: 'Learners trained' },
  { value: '100+', label: 'Projects shipped' },
  { value: '10 yrs', label: 'Experience' },
];
const DEFAULT_FAQS = [
  { q: 'Do I need coding experience?', a: 'No. The class is built for beginners and business owners. We use AI and no-code tools, and Ravi guides you step by step.' },
  { q: 'Where is the class held?', a: 'Fully online and live. After you register, we send the joining link to your email and WhatsApp before each session.' },
  { q: 'Will I get a recording if I miss a session?', a: 'Yes — every session is recorded and you get lifetime access, so you can rewatch or catch up anytime.' },
  { q: 'Do I get a certificate?', a: 'Yes, you receive a HackGRU certificate after completing the class.' },
];

const liveClassSchema = new mongoose.Schema(
  {
    slug: { type: String, trim: true, lowercase: true, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    // Optional coloured tail of the headline, e.g. "Your Business".
    titleAccent: { type: String, default: '', trim: true },
    tagline: { type: String, default: '', trim: true },
    eyebrow: { type: String, default: 'Live online · Weekend batch', trim: true },

    price: { type: Number, required: true, min: 0 },   // INR
    mrp: { type: Number, default: 0, min: 0 },          // strike-through list price (0 = none)
    currency: { type: String, default: 'INR' },

    // Quick hero facts (the "Starts" / "Timings" labels). Slots drive registration;
    // these are just the at-a-glance summary.
    startsOn: { type: String, default: '', trim: true },
    timings: { type: String, default: '', trim: true },
    trustText: { type: String, default: '30,000+ learners trained · 4.8★ rating', trim: true },

    instructor: {
      name: { type: String, default: 'Ravikumar S', trim: true },
      role: { type: String, default: 'Founder & Managing Director, HackGeniX Tech', trim: true },
      bio: {
        type: String,
        default: "10 years building software and training engineers across Tamil Nadu. I'll teach the way I actually use it in business — practical, hands-on, and built to get results fast.",
        trim: true,
      },
      photoUrl: { type: String, default: '/live/ravi.jpg', trim: true },
    },

    highlights: { type: [highlightSchema], default: () => DEFAULT_HIGHLIGHTS },
    stats: { type: [statSchema], default: () => DEFAULT_STATS },
    faqs: { type: [faqSchema], default: () => DEFAULT_FAQS },

    slots: { type: [slotSchema], default: [] },

    // Publish toggle — an unpublished class 404s on its public page.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

liveClassSchema.pre('validate', function (next) {
  if (!this.slug && this.title) {
    this.slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  next();
});

/** Shape sent to the PUBLIC landing page (no internal fields). */
liveClassSchema.methods.toPublic = function () {
  return {
    slug: this.slug,
    title: this.title,
    titleAccent: this.titleAccent,
    tagline: this.tagline,
    eyebrow: this.eyebrow,
    price: this.price,
    mrp: this.mrp,
    currency: this.currency,
    startsOn: this.startsOn,
    timings: this.timings,
    trustText: this.trustText,
    instructor: this.instructor,
    highlights: this.highlights,
    stats: this.stats,
    faqs: this.faqs,
    // Active slots offered for registration (online — no seat cap).
    slots: (this.slots || [])
      .filter((s) => s.active)
      .map((s) => ({ id: String(s._id), date: s.date, time: s.time })),
  };
};

export const LiveClass = mongoose.model('LiveClass', liveClassSchema);
