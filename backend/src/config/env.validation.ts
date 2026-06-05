const BLOCKED_JWT_SECRETS = new Set(['secret', 'development_jwt_secret', 'changeme', 'jwt_secret']);

export function validateEnv(): void {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const jwtSecret = process.env.JWT_SECRET?.trim();

  if (nodeEnv === 'production') {
    if (!jwtSecret || jwtSecret.length < 32 || BLOCKED_JWT_SECRETS.has(jwtSecret.toLowerCase())) {
      throw new Error(
        'JWT_SECRET must be set to a strong value (minimum 32 characters) in production.',
      );
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
