import { S3Client, HeadBucketCommand, GetBucketAclCommand } from '@aws-sdk/client-s3';
import { env } from './env.js';

/**
 * S3, configured the same way Razorpay is: lazily, and gated on keys being
 * present. Without them the app runs fine and every upload button says so —
 * rather than the server refusing to boot.
 */

let client = null;

export const isStorageEnabled = () =>
  Boolean(env.s3.bucket && env.s3.region && env.s3.accessKeyId && env.s3.secretAccessKey);

export const getS3 = () => {
  if (!isStorageEnabled()) {
    throw new Error(
      'File storage is not configured. Set AWS_S3_BUCKET, AWS_REGION, AWS_ACCESS_KEY_ID ' +
      'and AWS_SECRET_ACCESS_KEY in server/.env — see docs/STORAGE.md.'
    );
  }
  if (!client) {
    client = new S3Client({
      region: env.s3.region,
      credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
      ...(env.s3.endpoint ? { endpoint: env.s3.endpoint, forcePathStyle: true } : {}),
    });
  }
  return client;
};

/**
 * Startup check.
 *
 * Two things worth knowing before a student's project report is riding on it:
 * whether the bucket is reachable at all, and whether it is PUBLIC. A public
 * bucket holding project reports and student photos is a data breach with a URL,
 * and the failure is silent — everything works, it's just readable by anyone who
 * guesses a key.
 *
 * Never throws. A storage problem shouldn't stop the site serving pages.
 */
export async function checkStorage() {
  if (!isStorageEnabled()) {
    console.log('ℹ  File storage not configured — uploads are disabled. (docs/STORAGE.md)');
    return { ok: false, configured: false };
  }
  try {
    const s3 = getS3();
    await s3.send(new HeadBucketCommand({ Bucket: env.s3.bucket }));
    console.log(`✓ S3 bucket reachable: ${env.s3.bucket} (${env.s3.region})`);
  } catch (e) {
    console.error(`✗ S3 bucket "${env.s3.bucket}" is not reachable: ${e.name || e.message}`);
    if (e.name === 'NotFound') console.error('   The bucket does not exist, or is in a different region.');
    if (e.name === 'Forbidden' || e.$metadata?.httpStatusCode === 403) {
      console.error('   Credentials are wrong, or the IAM user lacks s3:ListBucket on it.');
    }
    return { ok: false, configured: true, error: e.name || e.message };
  }

  // Best-effort — most IAM users won't have GetBucketAcl, and that's fine.
  try {
    const acl = await getS3().send(new GetBucketAclCommand({ Bucket: env.s3.bucket }));
    const publicGrant = (acl.Grants || []).find((g) =>
      g.Grantee?.URI?.includes('AllUsers') || g.Grantee?.URI?.includes('AuthenticatedUsers'));
    if (publicGrant) {
      console.error('');
      console.error('🚨 YOUR S3 BUCKET IS PUBLICLY READABLE.');
      console.error('   It will hold student photos and project reports. Anyone who guesses a');
      console.error('   key can read them, and nothing in the app will look broken.');
      console.error('   Fix: S3 console → Permissions → Block all public access → ON.');
      console.error('   HackGRU never needs public objects — everything is served by presigned URL.');
      console.error('');
      return { ok: true, configured: true, publicBucket: true };
    }
  } catch { /* no ACL permission — normal, and not a problem */ }

  return { ok: true, configured: true };
}
