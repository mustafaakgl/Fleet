import piexif from 'piexifjs';

export type HandoverPhotoCaptureMetadata = {
  takenAt: string;
  gpsLat?: number;
  gpsLng?: number;
  deviceInfo: string;
};

function formatExifDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function buildDeviceInfo(): string {
  if (typeof navigator === 'undefined') {
    return 'web-unknown';
  }
  return [
    navigator.userAgent,
    navigator.platform,
    `lang=${navigator.language}`,
  ].join(' | ');
}

export async function resolveGpsCoordinates(): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

export async function buildHandoverPhotoMetadata(): Promise<HandoverPhotoCaptureMetadata> {
  const takenAt = new Date().toISOString();
  const gps = await resolveGpsCoordinates();
  return {
    takenAt,
    gpsLat: gps?.lat,
    gpsLng: gps?.lng,
    deviceInfo: buildDeviceInfo(),
  };
}

export async function injectExifIntoJpegBlob(blob: Blob, takenAt: Date): Promise<Blob> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  const exifObj = {
    '0th': {
      [piexif.ImageIFD.DateTime]: formatExifDate(takenAt),
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: formatExifDate(takenAt),
      [piexif.ExifIFD.DateTimeDigitized]: formatExifDate(takenAt),
    },
  };
  const exifBytes = piexif.dump(exifObj);
  const withExif = piexif.insert(exifBytes, base64);
  const binary = atob(withExif.split(',')[1] ?? withExif);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'image/jpeg' });
}

export async function prepareHandoverPhotoFile(
  blob: Blob,
  fileName: string,
): Promise<{ file: File; metadata: HandoverPhotoCaptureMetadata }> {
  const metadata = await buildHandoverPhotoMetadata();
  const takenAt = new Date(metadata.takenAt);
  const withExif = await injectExifIntoJpegBlob(blob, takenAt);
  return {
    file: new File([withExif], fileName, { type: 'image/jpeg' }),
    metadata,
  };
}
