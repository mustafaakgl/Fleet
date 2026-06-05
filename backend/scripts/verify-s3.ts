/**
 * Verify S3/MinIO configuration before production deploy.
 * Usage: npm run verify:s3  (from backend/)
 */
import 'dotenv/config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

function fail(message: string): never {
  console.error(`[verify-s3] FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  if (process.env.STORAGE_DRIVER !== 's3') {
    fail('STORAGE_DRIVER must be s3');
  }

  const bucket = process.env.S3_BUCKET?.trim();
  const accessKey = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  const region = process.env.S3_REGION?.trim();

  if (!bucket) fail('S3_BUCKET is empty');
  if (!accessKey) fail('S3_ACCESS_KEY_ID is empty');
  if (!secretKey) fail('S3_SECRET_ACCESS_KEY is empty');
  if (!region) fail('S3_REGION is empty');

  const client = new S3Client({
    region,
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
  });

  console.log(`[verify-s3] Checking bucket ${bucket} (${region})…`);
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  console.log('[verify-s3] PASS — bucket reachable, credentials valid');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
