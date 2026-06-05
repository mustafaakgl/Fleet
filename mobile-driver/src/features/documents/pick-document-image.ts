import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import {
  ensureScannerCameraPermission,
  isDocumentScannerNativeAvailable,
  scanDocumentImage,
} from '@/lib/document-scanner';

export type PickedDocumentImage = { uri: string; name: string; type: string };

type PickMessages = {
  pickSourceTitle: string;
  scanDocument: string;
  takePhoto: string;
  chooseGallery: string;
  cancel: string;
  permissionRequired: string;
  cameraPermissionRequired: string;
  scanUnavailable: string;
  scanFailed: string;
};

export async function pickFromGallery(messages: PickMessages): Promise<PickedDocumentImage | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(messages.permissionRequired);
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? `document-${Date.now()}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
  };
}

export async function pickFromCamera(messages: PickMessages): Promise<PickedDocumentImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error(messages.cameraPermissionRequired);
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.85,
  });
  if (result.canceled || !result.assets[0]) {
    return null;
  }
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    name: asset.fileName ?? `document-${Date.now()}.jpg`,
    type: asset.mimeType ?? 'image/jpeg',
  };
}

export async function pickFromScanner(messages: PickMessages): Promise<PickedDocumentImage | null> {
  if (!isDocumentScannerNativeAvailable()) {
    throw new Error(messages.scanUnavailable);
  }
  const permitted = await ensureScannerCameraPermission();
  if (!permitted) {
    throw new Error(messages.cameraPermissionRequired);
  }
  const result = await scanDocumentImage({ maxNumDocuments: 1, quality: 90 });
  if (!result.ok) {
    if (result.reason === 'cancelled') {
      return null;
    }
    throw new Error(result.message ?? messages.scanFailed);
  }
  return {
    uri: result.uri,
    name: result.fileName,
    type: result.mimeType,
  };
}

export function showDocumentPickSourceAlert(
  messages: PickMessages,
  handlers: {
    onScan: () => void | Promise<void>;
    onCamera: () => void | Promise<void>;
    onGallery: () => void | Promise<void>;
  },
  contextLabel?: string,
) {
  Alert.alert(messages.pickSourceTitle, contextLabel, [
    { text: messages.scanDocument, onPress: () => void handlers.onScan() },
    { text: messages.takePhoto, onPress: () => void handlers.onCamera() },
    { text: messages.chooseGallery, onPress: () => void handlers.onGallery() },
    { text: messages.cancel, style: 'cancel' },
  ]);
}
