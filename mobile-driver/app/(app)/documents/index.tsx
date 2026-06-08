import { useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { driverApi } from '@/api/endpoints';
import type { DriverDocumentItem } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { colors, radius, spacing, typography } from '@/theme';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import {
  DRIVER_OFFICE_DOCUMENT_TYPES,
  DRIVER_UPLOAD_DOCUMENT_TYPES,
  documentTypeLabelKey,
} from '@/lib/driver-documents';
import { driverDocumentDownloadPath } from '@/lib/authenticated-files';
import {
  ensureScannerCameraPermission,
  isDocumentScannerNativeAvailable,
  scanDocumentImage,
} from '@/lib/document-scanner';

type PickedImage = { uri: string; name: string; type: string };

function statusLabel(t: (key: string) => string, status: DriverDocumentItem['status']) {
  if (status === 'expiring_soon') return t('documents.statusExpiringSoon');
  if (status === 'expired') return t('documents.statusExpired');
  if (status === 'missing') return t('documents.statusMissing');
  return t('documents.statusValid');
}

function statusColor(status: DriverDocumentItem['status']) {
  if (status === 'expired') return colors.danger;
  if (status === 'expiring_soon') return colors.warning;
  return colors.success;
}

export default function DriverDocumentsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [documentType, setDocumentType] = useState<string>(DRIVER_UPLOAD_DOCUMENT_TYPES[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<PickedImage | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-documents'],
    queryFn: () => driverApi.listDocuments(),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: PickedImage) =>
      driverApi.uploadDocument({
        documentType,
        expiryDate: expiryDate.trim() || undefined,
        notes: notes.trim() || undefined,
        file,
      }),
    onSuccess: async () => {
      setPendingFile(null);
      setPreviewUri(null);
      setNotes('');
      await queryClient.invalidateQueries({ queryKey: ['driver-documents'] });
      showSuccess(t('documents.uploadSuccess'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('documents.uploadFailed')));
    },
    onSettled: () => setIsUploading(false),
  });

  const typeLabel = (type: string) => {
    const key = documentTypeLabelKey(type);
    const translated = t(key);
    return translated === key ? type : translated;
  };

  const missingOffice = useMemo(
    () =>
      (data?.missingRequired ?? []).filter((type) =>
        (DRIVER_OFFICE_DOCUMENT_TYPES as readonly string[]).includes(type),
      ),
    [data?.missingRequired],
  );

  const missingLabels = useMemo(
    () => (data?.missingRequired ?? []).map(typeLabel).join(', '),
    [data?.missingRequired, t],
  );

  const uploadAsset = (file: PickedImage) => {
    setPendingFile(file);
    setPreviewUri(file.uri);
  };

  const pickFromGallery = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showError(t('documents.permissionRequired'));
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
    uploadAsset({
      uri: asset.uri,
      name: asset.fileName ?? `document-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
  };

  const pickFromCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showError(t('documents.cameraPermissionRequired'));
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
    uploadAsset({
      uri: asset.uri,
      name: asset.fileName ?? `document-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
  };

  const pickFromScanner = async () => {
    if (!isDocumentScannerNativeAvailable()) {
      showError(t('documents.scanUnavailable'));
      return;
    }
    const permitted = await ensureScannerCameraPermission();
    if (!permitted) {
      showError(t('documents.cameraPermissionRequired'));
      return;
    }
    const result = await scanDocumentImage({ maxNumDocuments: 1, quality: 90 });
    if (!result.ok) {
      if (result.reason !== 'cancelled') {
        showError(result.message ?? t('documents.scanFailed'));
      }
      return;
    }
    uploadAsset({
      uri: result.uri,
      name: result.fileName,
      type: result.mimeType,
    });
  };

  const pickSource = () => {
    Alert.alert(t('documents.pickSourceTitle'), typeLabel(documentType), [
      { text: t('documents.scanDocument'), onPress: () => void pickFromScanner() },
      { text: t('documents.takePhoto'), onPress: () => void pickFromCamera() },
      { text: t('documents.chooseGallery'), onPress: () => void pickFromGallery() },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const submitUpload = () => {
    if (!pendingFile) {
      pickSource();
      return;
    }
    setIsUploading(true);
    uploadMutation.mutate(pendingFile);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('documents.title') }} />
      <ScreenLayout title={t('documents.title')} subtitle={t('documents.subtitle')}>
        {isLoading ? <LoadingState label={t('common.loading')} /> : null}
        {!isLoading && error ? (
          <ErrorState
            message={getErrorMessage(error, t('documents.loadFailed'))}
            onRetry={() => void refetch()}
          />
        ) : null}
        {!isLoading && data ? (
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            {data.missingRequired.length > 0 ? (
              <View style={styles.alert}>
                <Feather name="alert-circle" size={18} color={colors.warning} />
                <Text style={styles.alertText}>
                  {t('documents.missingRequired', { types: missingLabels })}
                </Text>
              </View>
            ) : null}

            {missingOffice.length > 0 ? (
              <View style={styles.alert}>
                <Feather name="info" size={18} color={colors.accent} />
                <Text style={styles.alertText}>
                  {t('documents.officeProvidedHint')} {missingOffice.map(typeLabel).join(', ')}
                </Text>
              </View>
            ) : null}

            <Text style={styles.sectionTitle}>{t('documents.uploadSection')}</Text>
            <Text style={styles.hint}>{t('documents.scanHint')}</Text>

            <Text style={styles.fieldLabel}>{t('documents.selectType')}</Text>
            <View style={styles.typeRow}>
              {DRIVER_UPLOAD_DOCUMENT_TYPES.map((type) => (
                <Pressable
                  key={type}
                  style={[styles.typeChip, documentType === type && styles.typeChipActive]}
                  onPress={() => setDocumentType(type)}
                >
                  <Text
                    style={[styles.typeChipText, documentType === type && styles.typeChipTextActive]}
                  >
                    {typeLabel(type)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>{t('documents.expiryDate')}</Text>
            <TextInput
              style={styles.input}
              value={expiryDate}
              onChangeText={setExpiryDate}
              placeholder="2027-12-31"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
            />

            <Text style={styles.fieldLabel}>{t('documents.notes')}</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholderTextColor={colors.muted}
              multiline
            />

            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.preview} resizeMode="contain" />
            ) : null}

            <ActionButton
              label={
                isUploading || uploadMutation.isPending
                  ? t('documents.uploading')
                  : pendingFile
                    ? t('common.save')
                    : t('documents.addDocument')
              }
              onPress={() => (pendingFile ? submitUpload() : pickSource())}
              disabled={isUploading || uploadMutation.isPending}
            />
            {pendingFile ? (
              <Pressable onPress={pickSource} style={styles.changePhoto}>
                <Text style={styles.changePhotoText}>{t('handover.replacePhoto')}</Text>
              </Pressable>
            ) : null}

            <Text style={[styles.sectionTitle, styles.listTitle]}>
              {data.items.length === 0 ? t('documents.noneYet') : `${data.items.length}`}
            </Text>
            {data.items.map((item) => (
              <View key={item.id} style={styles.docCard}>
                <View style={styles.docHeader}>
                  <Text style={styles.docType}>{typeLabel(item.documentType)}</Text>
                  <View style={[styles.statusBadge, { borderColor: statusColor(item.status) }]}>
                    <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                      {statusLabel(t, item.status)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.docMeta}>{item.fileName}</Text>
                {item.expiryDate ? (
                  <Text style={styles.docMeta}>
                    {new Date(item.expiryDate).toLocaleDateString()}
                  </Text>
                ) : null}
                {item.download_url || item.fileUrl ? (
                  <AuthenticatedImage
                    apiPath={item.download_url ?? driverDocumentDownloadPath(item.id)}
                    style={styles.thumb}
                    resizeMode="cover"
                  />
                ) : null}
              </View>
            ))}
          </ScrollView>
        ) : null}
      </ScreenLayout>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: spacing.md, paddingBottom: spacing.xl },
  alert: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  alertText: { ...typography.body, flex: 1, color: colors.primary },
  sectionTitle: { ...typography.h3, marginTop: spacing.sm },
  listTitle: { marginTop: spacing.lg },
  hint: { ...typography.caption, textTransform: 'none', color: colors.subtext },
  fieldLabel: { ...typography.caption, textTransform: 'none', marginTop: spacing.xs },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  typeChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  typeChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  typeChipText: { fontSize: 13, fontWeight: '600', color: colors.subtext },
  typeChipTextActive: { color: colors.accent },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    color: colors.primary,
    fontSize: 15,
  },
  notesInput: { minHeight: 72, textAlignVertical: 'top' },
  preview: {
    width: '100%',
    height: 200,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  changePhoto: { alignSelf: 'center' },
  changePhotoText: { color: colors.accent, fontWeight: '600' },
  docCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  docHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  docType: { ...typography.bodyMedium, flex: 1 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  docMeta: { ...typography.caption, textTransform: 'none', color: colors.subtext },
  thumb: { width: '100%', height: 120, borderRadius: radius.sm, marginTop: spacing.xs },
});
