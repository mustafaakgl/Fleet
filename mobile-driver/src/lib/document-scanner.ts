import Constants from 'expo-constants';
import { PermissionsAndroid, Platform } from 'react-native';

export type ScanDocumentResult =
  | { ok: true; uri: string; fileName: string; mimeType: string }
  | { ok: false; reason: 'cancelled' | 'unavailable' | 'error'; message?: string };

type DocumentScannerModule = {
  default: {
    scanDocument: (options?: {
      maxNumDocuments?: number;
      croppedImageQuality?: number;
    }) => Promise<{
      status?: string;
      scannedImages?: string[];
    }>;
  };
  ScanDocumentResponseStatus: {
    Cancel: string;
  };
};

let cachedModule: DocumentScannerModule | null | undefined;

function isExpoGo(): boolean {
  return Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
}

/** Load native module only when needed — avoids crash in Expo Go / web at import time. */
function getDocumentScannerModule(): DocumentScannerModule | null {
  if (cachedModule !== undefined) {
    return cachedModule;
  }

  if (Platform.OS === 'web' || isExpoGo()) {
    cachedModule = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedModule = require('react-native-document-scanner-plugin') as DocumentScannerModule;
    return cachedModule;
  } catch {
    cachedModule = null;
    return null;
  }
}

/** Native VisionKit (iOS) / ML Kit (Android) — requires dev build, not Expo Go. */
export function isDocumentScannerNativeAvailable(): boolean {
  return getDocumentScannerModule() !== null;
}

function normalizeFileUri(path: string): string {
  if (path.startsWith('file://') || path.startsWith('content://')) {
    return path;
  }
  return `file://${path}`;
}

/**
 * Opens the system document scanner (edge detect + crop).
 * Returns a single JPEG suitable for upload.
 */
export async function scanDocumentImage(options?: {
  maxNumDocuments?: number;
  quality?: number;
}): Promise<ScanDocumentResult> {
  const scanner = getDocumentScannerModule();
  if (!scanner) {
    return {
      ok: false,
      reason: 'unavailable',
      message:
        'Document scan needs a development build (expo run:ios / run:android). It does not work in Expo Go.',
    };
  }

  try {
    const response = await scanner.default.scanDocument({
      maxNumDocuments: options?.maxNumDocuments ?? 1,
      croppedImageQuality: options?.quality ?? 90,
    });

    const cancelled =
      response.status === scanner.ScanDocumentResponseStatus.Cancel ||
      response.status === 'cancel' ||
      !response.scannedImages?.length;

    if (cancelled) {
      return { ok: false, reason: 'cancelled' };
    }

    const scanned = response.scannedImages!;
    const uri = normalizeFileUri(scanned[0]);
    const fileName = `scan-${Date.now()}.jpg`;
    return { ok: true, uri, fileName, mimeType: 'image/jpeg' };
  } catch (error) {
    return {
      ok: false,
      reason: 'error',
      message: error instanceof Error ? error.message : 'Document scan failed',
    };
  }
}

/** Android: ML Kit scanner may need explicit camera permission when combined with image-picker. */
export async function ensureScannerCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}
