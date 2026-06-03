import { isAxiosError } from 'axios';

/** User-facing API error message with network-aware copy. */
export function getApiErrorMessage(error: unknown, fallbackKey = 'errors.generic'): string {
  if (isAxiosError(error)) {
    if (!error.response) {
      return 'errors.network';
    }
    const data = error.response.data as { message?: string | string[] } | undefined;
    if (data?.message) {
      return Array.isArray(data.message) ? data.message.join('. ') : data.message;
    }
    if (error.response.status >= 500) {
      return 'errors.server';
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackKey;
}

export function isNetworkError(error: unknown): boolean {
  return isAxiosError(error) && !error.response;
}
