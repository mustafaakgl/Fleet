import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateEnv } from './env.validation';

const VALID_KEY_HEX = 'a'.repeat(64);
const VALID_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');

/** Minimal environment that already satisfies every other production gate. */
function productionEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    JWT_SECRET: 'a-sufficiently-long-production-jwt-secret-value',
    SMTP_ENABLED: 'true',
    SMTP_HOST: 'smtp.example.com',
    SMTP_FROM: 'noreply@example.com',
    FRONTEND_URL: 'https://app.example.com',
    DATA_CONTROLLER_NAME: 'Beispiel Logistik GmbH',
    PRIVACY_CONTACT_EMAIL: 'datenschutz@example.com',
    STORAGE_DRIVER: 's3',
    S3_BUCKET: 'fleet-prod',
    S3_ACCESS_KEY_ID: 'key-id',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_REGION: 'eu-central-1',
    METRICS_TOKEN: 'metrics-token',
    CORS_ORIGIN: 'https://app.example.com',
    SENTRY_DSN: 'https://sentry.example.com/1',
    TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY: VALID_KEY_HEX,
    LICENSE_PHOTO_ENCRYPTION_KEY: VALID_KEY_HEX,
  };
}

/** Runs validateEnv against exactly the given environment, then restores the real one. */
function withEnv(env: Record<string, string | undefined>, run: () => void): void {
  const original = process.env;
  const next: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) next[key] = value;
  }

  process.env = next;
  try {
    run();
  } finally {
    process.env = original;
  }
}

describe('validateEnv — photo encryption keys', () => {
  it('accepts a complete production environment', () => {
    withEnv(productionEnv(), () => {
      assert.doesNotThrow(() => validateEnv());
    });
  });

  it('refuses to boot without a licence photo encryption key', () => {
    const env = productionEnv();
    delete env.LICENSE_PHOTO_ENCRYPTION_KEY;

    withEnv(env, () => {
      assert.throws(() => validateEnv(), /LICENSE_PHOTO_ENCRYPTION_KEY must be set/);
    });
  });

  it('refuses a licence key that the crypto service could not use', () => {
    // The crypto service silently disables encryption for a key it cannot parse,
    // so a malformed value must fail at boot rather than at the first upload.
    withEnv({ ...productionEnv(), LICENSE_PHOTO_ENCRYPTION_KEY: 'changeme' }, () => {
      assert.throws(() => validateEnv(), /LICENSE_PHOTO_ENCRYPTION_KEY must be 32 bytes/);
    });
  });

  it('accepts a base64 licence key of 32 bytes', () => {
    withEnv({ ...productionEnv(), LICENSE_PHOTO_ENCRYPTION_KEY: VALID_KEY_BASE64 }, () => {
      assert.doesNotThrow(() => validateEnv());
    });
  });

  it('allows an absent defect key, because it falls back to the licence key', () => {
    const env = productionEnv();
    delete env.DEFECT_PHOTO_ENCRYPTION_KEY;

    withEnv(env, () => {
      assert.doesNotThrow(() => validateEnv());
    });
  });

  it('refuses a defect key that is present but malformed', () => {
    withEnv({ ...productionEnv(), DEFECT_PHOTO_ENCRYPTION_KEY: 'nope' }, () => {
      assert.throws(() => validateEnv(), /DEFECT_PHOTO_ENCRYPTION_KEY must be 32 bytes/);
    });
  });

  it('does not require the keys outside production', () => {
    withEnv({ NODE_ENV: 'development', JWT_SECRET: 'dev-secret' }, () => {
      assert.doesNotThrow(() => validateEnv());
    });
  });
});
