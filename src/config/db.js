import mongoose from 'mongoose';
import { env } from './env.js';

/**
 * Validate a Mongo connection string BEFORE connecting.
 * These mistakes are all silent failures otherwise — the worst kind.
 */
export function validateMongoUri(uri) {
  const problems = [];
  if (!uri) return { problems: ['MONGO_URI is not set. Copy .env.example to .env and fill it in.'], dbName: '' };

  if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
    problems.push(`MONGO_URI must start with "mongodb://" or "mongodb+srv://" (got "${uri.slice(0, 24)}…").`);
    return { problems, dbName: '' };
  }

  // Everything between the host and the "?" is the database name.
  const match = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/);
  const dbName = match?.[1] || '';

  if (!dbName) {
    problems.push(
      'MONGO_URI has no database name, so Mongoose will silently use a database called "test".\n' +
      '     Add the name after the host, before any "?":\n' +
      '       …mongodb.net/hackgru?retryWrites=true&w=majority'
    );
  }

  // An unencoded @ / : / / in the password breaks parsing in confusing ways.
  const creds = uri.split('//')[1]?.split('@')[0] || '';
  if ((uri.match(/@/g) || []).length > 1) {
    problems.push(
      'MONGO_URI looks like it has an unencoded special character in the password.\n' +
      '     URL-encode it (@ → %40, : → %3A, / → %2F), or use a password with only letters and numbers.'
    );
  }
  if (/<|>/.test(creds)) {
    problems.push('MONGO_URI still contains a placeholder like <password>. Replace it with the real value.');
  }

  return { problems, dbName };
}

/** True for anything that isn't a local dev database. */
export const isRemoteUri = (uri = '') =>
  !/(localhost|127\.0\.0\.1|0\.0\.0\.0|mongodb:\/\/mongo[:/])/.test(uri);

/**
 * Connect to MongoDB. Isolated so nothing else touches the driver directly.
 */
export async function connectDB() {
  const { problems, dbName } = validateMongoUri(env.mongoUri);
  if (problems.length) {
    console.error('\n✗ Your MONGO_URI has a problem:\n');
    problems.forEach((p) => console.error('   • ' + p));
    console.error('');
    throw new Error('Invalid MONGO_URI');
  }

  mongoose.set('strictQuery', true);
  try {
    const conn = await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: 15000 });
    console.log(`✓ MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
    if (isRemoteUri(env.mongoUri) && env.nodeEnv !== 'production') {
      console.warn(`⚠  You are pointing at a REMOTE database (${dbName}) while NODE_ENV=${env.nodeEnv}.`);
      console.warn('   `npm run seed` DELETES EVERYTHING in it. Be careful.');
    }
    return conn;
  } catch (err) {
    // Translate Atlas's most common failures into something actionable.
    const m = err.message || '';
    console.error('\n✗ Could not connect to MongoDB.\n');
    if (/whitelist|IP that isn't/i.test(m)) {
      console.error('   Your IP is not allowed by Atlas.');
      console.error('   Fix: Atlas → Network Access → Add IP Address → "Add Current IP Address".');
      console.error('   (Deploying? Add your host\'s IP, or 0.0.0.0/0 if it has no static IP.)');
    } else if (/authentication failed|bad auth/i.test(m)) {
      console.error('   Wrong username or password.');
      console.error('   Fix: Atlas → Database Access. If the password has special characters, URL-encode them.');
    } else if (/ENOTFOUND|querySrv/i.test(m)) {
      console.error('   The cluster hostname could not be resolved. Check for typos in MONGO_URI.');
    } else {
      console.error('   ' + m.slice(0, 300));
    }
    console.error('');
    throw err;
  }
}
