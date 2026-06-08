import * as Sentry from '@sentry/nextjs';

const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());

export async function register() {
  if (!sentryEnabled) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!sentryEnabled) {
    return;
  }
  return Sentry.captureRequestError(...args);
};
