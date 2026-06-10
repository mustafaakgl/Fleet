import * as FileSystem from 'expo-file-system/legacy';
import { Linking } from 'react-native';
import { env } from '@/config/env';
import { authStore } from '@/features/auth/store';

export function driverDocumentDownloadPath(documentId: string): string {
  return `/driver/documents/${documentId}/download`;
}

export function driverFineDocumentPath(fineId: string): string {
  return `/driver/fines/${fineId}/document`;
}

export function driverDefectPhotoPath(defectId: string, photoIndex: number): string {
  return `/driver/defects/${defectId}/photo/${photoIndex}`;
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

export async function openAuthenticatedFineDocument(fineId: string): Promise<void> {
  const token = authStore.getState().accessToken;
  const apiPath = driverFineDocumentPath(fineId);
  const extension = 'bin';
  const dest = `${FileSystem.cacheDirectory}fine-${fineId}.${extension}`;
  const result = await FileSystem.downloadAsync(resolveApiUrl(apiPath), dest, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (result.status !== 200) {
    throw new Error(`Download failed (${result.status})`);
  }
  const canOpen = await Linking.canOpenURL(result.uri);
  if (!canOpen) {
    throw new Error('Cannot open document on this device');
  }
  await Linking.openURL(result.uri);
}
