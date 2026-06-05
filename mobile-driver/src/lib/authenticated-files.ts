import { env } from '@/config/env';
import { authStore } from '@/features/auth/store';

export function driverDocumentDownloadPath(documentId: string): string {
  return `/driver/documents/${documentId}/download`;
}

function resolveApiUrl(path: string): string {
  const base = env.apiBaseUrl.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalized}`;
}

export async function openAuthenticatedDocument(documentId: string): Promise<void> {
  const token = authStore.getState().accessToken;
  const response = await fetch(resolveApiUrl(driverDocumentDownloadPath(documentId)), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status})`);
  }
}
