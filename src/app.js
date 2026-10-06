import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import routes from './routes/index.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { notFound, errorHandler } from './middleware/error.js';

export const createApp = () => {
  const app = express();

  // Behind Nginx (or any reverse proxy) every request carries an
  // X-Forwarded-For header. Express defaults `trust proxy` to false, and
  // express-rate-limit then THROWS ERR_ERL_UNEXPECTED_X_FORWARDED_FOR because
  // it can't identify the client. Trust exactly one hop (Nginx). Locally there
  // is no proxy, so this is a harmless no-op — same code runs both places.
  // Do NOT use `true`: that trusts a spoofable client-supplied header.
  app.set('trust proxy', 1);

  app.use(helmet());

  // CORS.
  // Production: only the configured client origin.
  // Development: any localhost port. Vite silently falls back to 5174 when 5173
  // is busy, and a CORS error there looks identical to a broken backend.
  /**
   * CORS.
   *
   * Production is an explicit allowlist. HackGRU runs across sub-domains
   * (app / admin / corporate) and a browser treats each as a separate ORIGIN,
   * so each must be named. `origin: true` reflects ANY site's origin back —
   * which means any page on the internet could call this API carrying a logged-in
   * student's token.
   *
   * Development accepts any localhost port, because Vite hops to 5174 when
   * 5173 is busy.
   */
  const isDev = env.nodeEnv !== 'production';
  const allowed = new Set(env.corsOrigins);

  app.use(cors({
    origin(origin, cb) {
      // No Origin header: curl, server-to-server, the Razorpay webhook. CORS is
      // a browser mechanism — there is nothing to enforce here.
      if (!origin) return cb(null, true);
      if (allowed.has(origin.replace(/\/$/, ''))) return cb(null, true);
      if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);

      // Name the origin that was refused, or this is 40 minutes of guessing.
      console.warn(`[cors] refused ${origin}\n       allowed: ${[...allowed].join(', ')}`);
      return cb(new Error(`Origin ${origin} is not allowed. Add it to CORS_ORIGINS in server/.env.`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Razorpay-Signature'],
  }));
  // ⚠️ ORDER MATTERS. The Razorpay webhook signature is an HMAC of the RAW
  // request body. express.json() parses the body and discards the raw bytes,
  // which makes the signature impossible to verify. Mount the webhook first,
  // with a raw body parser of its own.
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }), webhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv === 'development') app.use(morgan('dev'));

  // Don't rate-limit the webhook: Razorpay retries on failure and a 429 would
  // look like an outage, delaying enrolments for students who have already paid.
  app.use('/api', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    skip: (req) => req.path.startsWith('/payments/webhook'),
  }));
  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
};
