import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import { showError } from '@/utils/feedback';
import {
  ensureScannerCameraPermission,
  isDocumentScannerNativeAvailable,
  scanDocumentImage,
} from '@/lib/document-scanner';

export type PickedAttachment = { uri: string; name: string; type: string };

type RequestAttachmentsPickerProps = {
  files: PickedAttachment[];
  onChange: (files: PickedAttachment[]) => void;
  maxFiles?: number;
};

export function RequestAttachmentsPicker({
  files,
  onChange,
  maxFiles = 5,
}: RequestAttachmentsPickerProps) {
  const { t } = useTranslation();

  const addFile = (file: PickedAttachment) => {
    if (files.length >= maxFiles) {
      showError(t('requests.attachments.maxReached', { max: maxFiles }));
      return;
    }
    onChange([...files, file]);
  };

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showError(t('requests.attachments.permissionRequired'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    const asset = result.assets[0];
    addFile({
      uri: asset.uri,
      name: asset.fileName ?? `attachment-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
  };

  const pickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showError(t('requests.attachments.cameraPermissionRequired'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    const asset = result.assets[0];
    addFile({
      uri: asset.uri,
      name: asset.fileName ?? `attachment-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
  };

  const pickFromScanner = async () => {
    if (!isDocumentScannerNativeAvailable()) {
      showError(t('requests.attachments.scanUnavailable'));
      return;
    }
    const permitted = await ensureScannerCameraPermission();
    if (!permitted) {
      showError(t('requests.attachments.cameraPermissionRequired'));
      return;
    }
    const result = await scanDocumentImage({ maxNumDocuments: 1, quality: 90 });
    if (!result.ok) {
      if (result.reason !== 'cancelled') {
        showError(result.message ?? t('requests.attachments.scanFailed'));
      }
      return;
    }
    addFile({
      uri: result.uri,
      name: result.fileName,
      type: result.mimeType,
    });
  };

  const pickFromPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) {
      return;
    }
    const asset = result.assets[0];
    const mimeType = asset.mimeType ?? 'application/pdf';
    addFile({
      uri: asset.uri,
      name: asset.name ?? `attachment-${Date.now()}.pdf`,
      type: mimeType,
    });
  };

  const pickSource = () => {
    Alert.alert(t('requests.attachments.pickTitle'), t('requests.attachments.pickHint'), [
      { text: t('requests.attachments.scan'), onPress: () => void pickFromScanner() },
      { text: t('requests.attachments.camera'), onPress: () => void pickFromCamera() },
      { text: t('requests.attachments.gallery'), onPress: () => void pickFromGallery() },
      { text: t('requests.attachments.pdf'), onPress: () => void pickFromPdf() },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('requests.attachments.label')}</Text>
      <Text style={styles.hint}>{t('requests.attachments.hint', { max: maxFiles })}</Text>
      <Pressable style={styles.addButton} onPress={pickSource}>
        <Feather name="paperclip" size={16} color={colors.accent} />
        <Text style={styles.addText}>{t('requests.attachments.add')}</Text>
      </Pressable>
      {files.map((file, index) => (
        <View key={`${file.uri}-${index}`} style={styles.fileRow}>
          <Feather name="file" size={14} color={colors.subtext} />
          <Text style={styles.fileName} numberOfLines={1}>
            {file.name}
          </Text>
          <Pressable onPress={() => removeFile(index)} hitSlop={8}>
            <Feather name="x" size={16} color={colors.danger} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { ...typography.caption, textTransform: 'none', fontWeight: '700', color: colors.primary },
  hint: { ...typography.caption, textTransform: 'none', color: colors.subtext },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.accentSoft,
  },
  addText: { color: colors.accent, fontWeight: '600', fontSize: 13 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  fileName: { ...typography.body, flex: 1, fontSize: 13 },
});
