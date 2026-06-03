import axios from 'axios';
import { router } from 'expo-router';
import { getErrorMessage } from '@/utils/errors';
import { showError } from '@/utils/feedback';

export function isMessengerForbidden(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 403;
}

export function handleMessengerForbidden(error: unknown, fallbackMessage?: string): boolean {
  if (!isMessengerForbidden(error)) {
    return false;
  }

  showError(getErrorMessage(error, fallbackMessage ?? 'You do not have access to this conversation.'));
  router.replace('/(app)/messages');
  return true;
}
