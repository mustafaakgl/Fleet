import { showToast } from '@/providers/ToastProvider';

export function showSuccess(message: string) {
  showToast(message, 'success');
}

export function showError(message: string) {
  showToast(message, 'error');
}
