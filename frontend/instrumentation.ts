const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN?.trim());

export async function register() {
  if (!sentryEnabled) {
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
}

type CaptureRequestError = typeof import('@sentry/nextjs').captureRequestError;

export const onRequestError: CaptureRequestError = async (...args) => {
  if (!sentryEnabled) {
    return;
  }
  const sentry = await import('@sentry/nextjs');
  return sentry.captureRequestError(...args);
};
