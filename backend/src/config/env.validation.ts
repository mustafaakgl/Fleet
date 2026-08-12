import { MOCK_PROVIDER_IN_PRODUCTION_MESSAGE } from '../fleet/fuel-stations/fuel-station-provider.config';

const BLOCKED_JWT_SECRETS = new Set([
  'secret',
  'development_jwt_secret',
  'development_jwt_secret_minimum_32_chars',
  'dev_jwt_secret_minimum_32_chars_ok',
  'changeme',
  'jwt_secret',
]);

const BLOCKED_TACHO_ENCRYPTION_KEYS = new Set([
  '0123456789abcdef0123456789abcdef',
]);

function requireProductionEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set in production.`);
  }
  return value;
}

/**
 * Photo crypto services accept 64 hex chars or base64 that decodes to 32 bytes,
 * and fall back to storing photos *unencrypted* when the value does not parse.
 * A malformed key must therefore stop the boot, not merely log a warning.
 */
function assertPhotoEncryptionKey(name: string, value: string): void {
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return;
  }
  if (Buffer.from(value, 'base64').length === 32) {
    return;
  }
  throw new Error(
    `${name} must be 32 bytes (64 hex characters or base64) in production — ` +
      'photos would otherwise be stored unencrypted.',
  );
}

export function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? 'development') === 'production';
}

export function validateEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const jwtSecret = process.env.JWT_SECRET?.trim();

  if (nodeEnv === 'production') {
    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a strong value (minimum 32 characters) in production.',
      );
    }
    if (BLOCKED_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
      throw new Error('JWT_SECRET must not use default placeholder values from .env.example in production.');
    }

    if ((process.env.SMTP_ENABLED ?? '').toLowerCase() !== 'true') {
      throw new Error('SMTP_ENABLED must be true in production.');
    }
    requireProductionEnv('SMTP_HOST');
    requireProductionEnv('SMTP_FROM');

    const frontendUrl = requireProductionEnv('FRONTEND_URL');
    if (frontendUrl.includes('localhost') || frontendUrl.includes('127.0.0.1')) {
      throw new Error('FRONTEND_URL must be the public app URL in production.');
    }

    const dataController = requireProductionEnv('DATA_CONTROLLER_NAME');
    if (dataController === '[FIRMENNAME]') {
      throw new Error('DATA_CONTROLLER_NAME must be replaced with the customer legal name.');
    }

    const privacyEmail = requireProductionEnv('PRIVACY_CONTACT_EMAIL');
    if (privacyEmail === 'privacy@example.com') {
      throw new Error('PRIVACY_CONTACT_EMAIL must be a real mailbox in production.');
    }

    if (process.env.STORAGE_DRIVER !== 's3') {
      throw new Error('STORAGE_DRIVER must be s3 in production.');
    }
    requireProductionEnv('S3_BUCKET');
    requireProductionEnv('S3_ACCESS_KEY_ID');
    requireProductionEnv('S3_SECRET_ACCESS_KEY');
    requireProductionEnv('S3_REGION');
    requireProductionEnv('METRICS_TOKEN');

    if (!process.env.CORS_ORIGIN?.trim()) {
      throw new Error('CORS_ORIGIN must list allowed frontend origins in production.');
    }

    if (!process.env.SENTRY_DSN?.trim()) {
      console.warn('[boot] SENTRY_DSN not set — error monitoring disabled in production.');
    }

    if ((process.env.STRIPE_ENABLED ?? '').toLowerCase() === 'true') {
      requireProductionEnv('STRIPE_SECRET_KEY');
      requireProductionEnv('STRIPE_WEBHOOK_SECRET');
      if (!process.env.STRIPE_PRICE_BASIC?.trim()) {
        console.warn('[boot] STRIPE_PRICE_BASIC not set — Basic plan checkout unavailable.');
      }
    }

    // Sahte yakit fiyati surucuye ULASMAMALI: mock saglayici uretimde
    // yapilandirilmissa surec baslamamali. Modul fabrikasi da ayni kontrolu
    // yapiyor; buradaki kopya, hatanin ilk surucu istegini beklemek yerine
    // acilis loglarinda gorunmesini sagliyor.
    if ((process.env.FUEL_STATION_PROVIDER ?? '').trim().toLowerCase() === 'mock') {
      throw new Error(MOCK_PROVIDER_IN_PRODUCTION_MESSAGE);
    }

    const tachoCredentialKey = requireProductionEnv('TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY');
    if (BLOCKED_TACHO_ENCRYPTION_KEYS.has(tachoCredentialKey.toLowerCase())) {
      throw new Error(
        'TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY must not use default placeholder values from .env.example in production.',
      );
    }

    // A driving licence photo is an identity document. Without a key the crypto
    // services store photos in the clear and only log a warning, so the key is
    // required here. DefectPhotoCryptoService falls back to the licence key, so
    // requiring that one covers defect photos too; a separate defect key is
    // optional but must still parse if it is set.
    const licensePhotoKey = requireProductionEnv('LICENSE_PHOTO_ENCRYPTION_KEY');
    assertPhotoEncryptionKey('LICENSE_PHOTO_ENCRYPTION_KEY', licensePhotoKey);

    const defectPhotoKey = process.env.DEFECT_PHOTO_ENCRYPTION_KEY?.trim();
    if (defectPhotoKey) {
      assertPhotoEncryptionKey('DEFECT_PHOTO_ENCRYPTION_KEY', defectPhotoKey);
    }

    return;
  }

  if (!jwtSecret) {
    process.env.JWT_SECRET = 'development_jwt_secret';
    console.warn('[boot] JWT_SECRET not set — using development default (not for production).');
  }
}

export function getJwtSecret(): string {
  return process.env.JWT_SECRET ?? 'development_jwt_secret';
}

export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || '8h';
}

export function getFrontendUrl(): string {
  return process.env.FRONTEND_URL?.trim() || 'http://localhost:3001';
}

export function getDataControllerName(): string {
  return process.env.DATA_CONTROLLER_NAME?.trim() || '[FIRMENNAME]';
}

export function getPrivacyContactEmail(): string {
  return process.env.PRIVACY_CONTACT_EMAIL?.trim() || 'privacy@example.com';
}
