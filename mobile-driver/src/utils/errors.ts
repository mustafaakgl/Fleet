import axios from 'axios';

type ErrorPayload = {
  message?: string | string[];
  error?: string;
};

export function getErrorMessage(error: unknown, fallback = 'Unexpected error') {
  if (axios.isAxiosError<ErrorPayload>(error)) {
    const data = error.response?.data;
    const message = data?.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    if (typeof message === 'string' && message.trim().length > 0) {
      return message;
    }
    if (typeof data?.error === 'string' && data.error.trim().length > 0) {
      return data.error;
    }
    if (typeof error.message === 'string' && error.message.trim().length > 0) {
      return error.message;
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}
