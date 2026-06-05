const BLOCKED_JWT_SECRETS = new Set(['secret', 'development_jwt_secret', 'changeme', 'jwt_secret']);

function requireProductionEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set in production.`);
  }
  return value;
}

export function isProductionEnv(): boolean {
  return (process.env.NODE_ENV ?? 'development') === 'production';
}

export function validateEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const jwtSecret = process.env.JWT_SECRET?.trim();

  if (nodeEnv === 'production') {
    if (!jwtSecret || jwtSecret.length < 32 || BLOCKED_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
      throw new Error(
        'JWT_SECRET must be set to a strong value (minimum 32 characters) in production.',
      );
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
      console.warn(
        '[boot] STORAGE_DRIVER is not s3 — uploads use local disk. Set STORAGE_DRIVER=s3 for production.',
      );
    }

    if (!process.env.S3_BUCKET?.trim() || !process.env.S3_ACCESS_KEY_ID?.trim()) {
      console.warn('[boot] S3 credentials incomplete — file storage may fail in production.');
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
