import { useEffect } from 'react';
import { router, Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { driverApi } from '@/api/endpoints';
import { authStore } from '@/features/auth/store';
import {
  pickFromCamera,
  pickFromGallery,
  pickFromScanner,
  showDocumentPickSourceAlert,
} from '@/features/documents/pick-document-image';
import { useTranslation } from '@/i18n/useTranslation';
import {
  DRIVER_REQUIRED_DOCUMENT_TYPES,
  documentTypeLabelKey,
} from '@/lib/driver-documents';
import { colors, radius, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

export default function DocumentOnboardingScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const clearSession = authStore((s) => s.clearSession);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['driver-documents'],
    queryFn: () => driverApi.listDocuments(),
  });

  const pickMessages = {
    pickSourceTitle: t('documents.pickSourceTitle'),
    scanDocument: t('documents.scanDocument'),
    takePhoto: t('documents.takePhoto'),
    chooseGallery: t('documents.chooseGallery'),
    cancel: t('common.cancel'),
    permissionRequired: t('documents.permissionRequired'),
    cameraPermissionRequired: t('documents.cameraPermissionRequired'),
    scanUnavailable: t('documents.scanUnavailable'),
    scanFailed: t('documents.scanFailed'),
  };

  const uploadMutation = useMutation({
    mutationFn: async ({
      documentType,
      file,
    }: {
      documentType: string;
      file: { uri: string; name: string; type: string };
    }) => driverApi.uploadDocument({ documentType, file }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['driver-documents'] });
      showSuccess(t('documents.uploadSuccess'));
    },
    onError: (error) => {
      showError(getErrorMessage(error, t('documents.uploadFailed')));
    },
  });

  const typeLabel = (type: string) => {
    const key = documentTypeLabelKey(type);
    const translated = t(key);
    return translated === key ? type : translated;
  };

  const missingRequired = data?.missingRequired ?? [...DRIVER_REQUIRED_DOCUMENT_TYPES];

  const allRequiredUploaded = !isLoading && missingRequired.length === 0;

  useEffect(() => {
    if (allRequiredUploaded) {
      router.replace('/(app)/today');
    }
  }, [allRequiredUploaded]);

  const handleUpload = (documentType: string) => {
    const contextLabel = typeLabel(documentType);
    showDocumentPickSourceAlert(
      pickMessages,
      {
        onScan: async () => {
          try {
            const file = await pickFromScanner(pickMessages);
            if (file) {
              uploadMutation.mutate({ documentType, file });
            }
          } catch (error) {
            showError(getErrorMessage(error, t('documents.scanFailed')));
          }
        },
        onCamera: async () => {
          try {
            const file = await pickFromCamera(pickMessages);
            if (file) {
              uploadMutation.mutate({ documentType, file });
            }
          } catch (error) {
            showError(getErrorMessage(error, t('documents.uploadFailed')));
          }
        },
        onGallery: async () => {
          try {
            const file = await pickFromGallery(pickMessages);
            if (file) {
              uploadMutation.mutate({ documentType, file });
            }
          } catch (error) {
            showError(getErrorMessage(error, t('documents.uploadFailed')));
          }
        },
      },
      contextLabel,
    );
  };

  const handleLogout = async () => {
    queryClient.clear();
    await clearSession();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Feather name="file-text" size={28} color={colors.white} />
        </View>
        <Text style={styles.title}>{t('documentOnboarding.title')}</Text>
        <Text style={styles.subtitle}>{t('documentOnboarding.subtitle')}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
      ) : (
        <View style={styles.list}>
          {DRIVER_REQUIRED_DOCUMENT_TYPES.map((documentType) => {
            const done = !missingRequired.includes(documentType);
            const uploading =
              uploadMutation.isPending && uploadMutation.variables?.documentType === documentType;
            return (
              <View key={documentType} style={styles.card}>
                <View style={styles.cardRow}>
                  <Feather
                    name={done ? 'check-circle' : 'circle'}
                    size={22}
                    color={done ? colors.success : colors.muted}
                  />
                  <Text style={styles.cardTitle}>{typeLabel(documentType)}</Text>
                </View>
                {done ? (
                  <Text style={styles.doneHint}>{t('documentOnboarding.uploaded')}</Text>
                ) : (
                  <Pressable
                    style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
                    onPress={() => handleUpload(documentType)}
                    disabled={uploadMutation.isPending}
                  >
                    {uploading ? (
                      <ActivityIndicator color={colors.white} size="small" />
                    ) : (
                      <>
                        <Feather name="upload" size={18} color={colors.white} />
                        <Text style={styles.uploadBtnText}>{t('documentOnboarding.upload')}</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.footerHint}>{t('documentOnboarding.footerHint')}</Text>
      <Pressable onPress={() => void refetch()} style={styles.retryLink}>
        <Text style={styles.retryText}>{t('common.retry')}</Text>
      </Pressable>
      <Pressable onPress={() => void handleLogout()} style={styles.logoutLink}>
        <Text style={styles.logoutText}>{t('common.logout')}</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  iconWrap: {
    backgroundColor: colors.primary,
    padding: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.xs,
  },
  title: { ...typography.h1, textAlign: 'center' },
  subtitle: {
    ...typography.caption,
    textTransform: 'none',
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    color: colors.subtext,
  },
  loader: { marginTop: spacing.xl },
  list: { gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { ...typography.h3, flex: 1 },
  doneHint: { ...typography.caption, textTransform: 'none', color: colors.success },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 12,
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  footerHint: {
    ...typography.caption,
    textTransform: 'none',
    textAlign: 'center',
    color: colors.muted,
    marginTop: 'auto',
  },
  retryLink: { alignSelf: 'center' },
  retryText: { color: colors.accent, fontWeight: '600' },
  logoutLink: { alignSelf: 'center', paddingBottom: spacing.sm },
  logoutText: { color: colors.muted, fontSize: 13 },
});
