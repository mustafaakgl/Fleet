import * as Device from 'expo-device';
import * as Location from 'expo-location';

export type HandoverPhotoCaptureMetadata = {
  takenAt: string;
  gpsLat?: number;
  gpsLng?: number;
  deviceInfo: string;
};

export function buildDeviceInfo(): string {
  return [
    Device.brand ?? 'unknown',
    Device.modelName ?? 'unknown',
    Device.osName ?? 'unknown',
    Device.osVersion ?? 'unknown',
  ].join(' | ');
}

export async function buildHandoverPhotoMetadata(): Promise<HandoverPhotoCaptureMetadata> {
  const takenAt = new Date().toISOString();
  let gpsLat: number | undefined;
  let gpsLng: number | undefined;

  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.granted) {
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      gpsLat = position.coords.latitude;
      gpsLng = position.coords.longitude;
    } catch {
      // GPS is optional; server still validates EXIF timestamps.
    }
  }

  return {
    takenAt,
    gpsLat,
    gpsLng,
    deviceInfo: buildDeviceInfo(),
  };
}
