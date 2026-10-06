import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Resolve the JWT secret.
 *
 * This used to be `process.env.JWT_SECRET || 'dev_secret_change_me'`. That is a
 * silent, critical hole: deploy with JWT_SECRET unset and the server happily
 * signs tokens with a string that is sitting in the repo. Anyone who reads it
 * can forge `{ role: 'admin' }` and walk into every admin route — no password,
 * no database, no trace.
 *
 * So: production REFUSES to start without a real one. Development generates a
 * random per-boot secret (which logs everyone out on restart — mildly annoying,
 * and a useful reminder to set it properly).
 */
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  const WEAK = ['dev_secret_change_me', 'change_this_to_a_long_random_string', 'secret', 'changeme'];

  if (NODE_ENV === 'production') {
    if (!secret) {
      throw new Error(
        'JWT_SECRET is not set.\n' +
        '   Generate one:  npm run generate:secret\n' +
        '   Then add it to your environment. Refusing to start without it — an\n' +
        '   unset secret would let anyone forge an admin token.'
      );
    }
    if (WEAK.includes(secret)) {
      throw new Error(
        'JWT_SECRET is still the placeholder from .env.example.\n' +
        '   Generate a real one:  npm run generate:secret'
      );
    }
    if (secret.length < 32) {
      throw new Error(
        `JWT_SECRET is only ${secret.length} characters — too short to be safe against\n` +
        '   offline brute force. Use at least 32.  npm run generate:secret'
      );
    }
    return secret;
  }

  if (!secret) {
    const temp = crypto.randomBytes(48).toString('base64url');
    console.warn('⚠  JWT_SECRET is not set — using a random one for this session.');
    console.warn('   Everyone will be logged out when the server restarts.');
    console.warn('   Set it properly:  npm run generate:secret');
    return temp;
  }
  if (WEAK.includes(secret) || secret.length < 32) {
    console.warn('⚠  JWT_SECRET is weak or a placeholder. Fine for local dev, but this');
    console.warn('   WILL be refused in production.  npm run generate:secret');
  }
  return secret;
}

/**
 * Two different things, deliberately kept apart:
 *
 *   publicSiteUrl — THE canonical site. One value. Used to BUILD links that get
 *                   pasted into WhatsApp and emails (/join/<token>). Must be a
 *                   single URL — a list here produces broken join links.
 *
 *   corsOrigins   — every browser origin allowed to CALL the API. A list.
 *
 * Conflating them is how a join link ends up reading
 * "https://hackgru.com,https://app.hackgru.com/join/abc".
 */
const parseOrigins = (raw) =>
  String(raw || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

/** Sub-domains this platform is served from. */
const DEFAULT_PROD_ORIGINS = [
  'https://hackgru.com',        // marketing + student portal
  'https://www.hackgru.com',
  'https://app.hackgru.com',    // college portal
  'https://admin.hackgru.com',  // master admin
  'https://corporate.hackgru.com', // companies / HR
];

export const env = {
  nodeEnv: NODE_ENV,
  port: process.env.PORT || 5050,   // 5050, not 5000: macOS AirPlay Receiver owns 5000
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/hackgru',
  jwtSecret: resolveJwtSecret(),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  /** ONE url. Join links and emails are built from this. */
  publicSiteUrl: (process.env.PUBLIC_SITE_URL || process.env.CLIENT_URL || 'http://localhost:5173')
    .replace(/\/$/, ''),

  /**
   * Origins allowed to call the API. Falls back to the known HackGRU
   * sub-domains, so a missing env var doesn't lock every portal out of
   * production — but CORS_ORIGINS wins if set.
   */
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS).length
    ? parseOrigins(process.env.CORS_ORIGINS)
    : DEFAULT_PROD_ORIGINS,

  /** Kept so nothing that still reads it breaks. Prefer publicSiteUrl. */
  clientUrl: (process.env.PUBLIC_SITE_URL || process.env.CLIENT_URL || 'http://localhost:5173')
    .replace(/\/$/, ''),

  // Razorpay (optional — checkout stays disabled until these are set)
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',

  // AI (optional — SSAT falls back to rules-based narrative without it)
  aiApiKey: process.env.AI_API_KEY || '',

  /**
   * S3. Uploads stay disabled until all four are set — the app runs fine
   * without them and every upload control says so.
   */
  s3: {
    bucket: process.env.AWS_S3_BUCKET || '',
    region: process.env.AWS_REGION || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    /** Only for S3-compatible services (MinIO, R2). Leave blank for real AWS. */
    endpoint: process.env.AWS_S3_ENDPOINT || '',
  },
  /**
   * Judge0 (via RapidAPI) — runs student code for the coding LMS. Stays disabled
   * until the key is set; the app runs fine without it and "Run" says so.
   */
  judge0: {
    key: process.env.JUDGE0_RAPIDAPI_KEY || '',
    host: process.env.JUDGE0_RAPIDAPI_HOST || 'judge0-ce.p.rapidapi.com',
  },
  aiBaseUrl: process.env.AI_BASE_URL || 'https://api.anthropic.com',
  aiModel: process.env.AI_MODEL || 'claude-sonnet-4-6',
  aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 25000),
  aiMaxTurnsPerSession: Number(process.env.AI_MAX_TURNS || 4),

  /**
   * Email (SMTP). Used for OTP verification, welcome, and payment receipts.
   * Leave SMTP_USER / SMTP_PASS blank to run WITHOUT email — in development the
   * OTP is printed to the server console instead so you can still test the flow.
   * In production, email must be configured or registration can't complete.
   *
   * Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_SECURE=true,
   * SMTP_USER=info.hackgru@gmail.com, SMTP_PASS=<16-char App Password>.
   * A normal Gmail password will NOT work — you must create an App Password
   * (Google Account → Security → 2-Step Verification → App passwords).
   */
  mail: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE ?? 'true') === 'true', // 465 = true, 587 = false
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    /** The From header. Falls back to the SMTP user. */
    from: process.env.MAIL_FROM || (process.env.SMTP_USER ? `HackGRU <${process.env.SMTP_USER}>` : ''),
    /** Shown in emails as the reply/support address. */
    supportEmail: process.env.SUPPORT_EMAIL || process.env.SMTP_USER || 'info.hackgru@gmail.com',
  },
};
