import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import jpeg from 'jpeg-js';
import { Image } from 'react-native';

export const MIN_LICENSE_PHOTO_WIDTH = 1280;
const MIN_LAPLACIAN_VARIANCE = 80;
const MIN_AVERAGE_LUMINANCE = 48;

export type PhotoQualityIssue = 'too_narrow' | 'too_dark' | 'too_blurry';

export type PhotoQualityResult =
  | { ok: true; width: number; height: number }
  | { ok: false; issue: PhotoQualityIssue; width?: number; height?: number };

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getImageSize(uri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

function toGrayscale(data: Uint8Array, width: number, height: number): Float32Array {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    gray[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }
  return gray;
}

function averageLuminance(gray: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) {
    sum += gray[i];
  }
  return sum / gray.length;
}

function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = y * width + x;
      const lap =
        -4 * gray[idx] +
        gray[idx - 1] +
        gray[idx + 1] +
        gray[idx - width] +
        gray[idx + width];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

async function decodeForAnalysis(uri: string): Promise<{
  gray: Float32Array;
  width: number;
  height: number;
}> {
  const resized = await manipulateAsync(uri, [{ resize: { width: 640 } }], {
    compress: 0.9,
    format: SaveFormat.JPEG,
  });

  const base64 = await FileSystem.readAsStringAsync(resized.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const decoded = jpeg.decode(base64ToUint8Array(base64), { useTArray: true });
  const gray = toGrayscale(decoded.data, decoded.width, decoded.height);
  return { gray, width: decoded.width, height: decoded.height };
}

export async function validateLicensePhotoQuality(uri: string): Promise<PhotoQualityResult> {
  const { width, height } = await getImageSize(uri);
  if (width < MIN_LICENSE_PHOTO_WIDTH) {
    return { ok: false, issue: 'too_narrow', width, height };
  }

  const { gray, width: analysisWidth, height: analysisHeight } = await decodeForAnalysis(uri);
  const luminance = averageLuminance(gray);
  if (luminance < MIN_AVERAGE_LUMINANCE) {
    return { ok: false, issue: 'too_dark', width, height };
  }

  const variance = laplacianVariance(gray, analysisWidth, analysisHeight);
  if (variance < MIN_LAPLACIAN_VARIANCE) {
    return { ok: false, issue: 'too_blurry', width, height };
  }

  return { ok: true, width, height };
}
