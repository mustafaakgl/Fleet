import { useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import type { HandoverPhotoSlot } from '@/api/types';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { useTranslation } from '@/i18n/useTranslation';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { colors, radius, spacing, typography } from '@/theme';

const HANDOVER_SLOTS: HandoverPhotoSlot[] = ['front', 'right', 'left', 'rear'];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function slotLabel(t: (key: string) => string, slot: HandoverPhotoSlot): string {
  if (slot === 'front') return t('handover.slotFront');
  if (slot === 'right') return t('handover.slotRight');
  if (slot === 'left') return t('handover.slotLeft');
  return t('handover.slotRear');
}

export default function VehicleHandoverUploadScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ assignmentId?: string; vehicleId?: string }>();
  const vehicleId = params.vehicleId ?? '';
  const assignmentId = params.assignmentId ?? '';
  const [uploadingSlot, setUploadingSlot] = useState<HandoverPhotoSlot | null>(null);

  const {
    data: handover,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['driver-handover', vehicleId, assignmentId, todayIsoDate()],
    enabled: Boolean(vehicleId),
    queryFn: async () => {
      const list = await driverApi.listHandovers({ date: todayIsoDate() });
      const existing = list.find(
        (row) => row.vehicleId === vehicleId && row.assignmentId === (assignmentId || null),
      );
      if (existing) {
        return driverApi.getHandover(existing.id);
      }
      return driverApi.createHandover({
        vehicleId,
        assignmentId: assignmentId || undefined,
        handoverType: 'pickup',
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ slot, uri, name, type }: { slot: HandoverPhotoSlot; uri: string; name: string; type: string }) => {
      if (!handover?.id) {
        throw new Error('Handover not ready');
      }
      return driverApi.uploadHandoverPhoto(handover.id, slot, { uri, name, type });
    },
    onSuccess: async () => {
      showSuccess(t('handover.uploadSuccess'));
      await queryClient.invalidateQueries({ queryKey: ['driver-handover', vehicleId, assignmentId] });
      await queryClient.invalidateQueries({ queryKey: ['driver-handovers'] });
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('handover.uploadFailed')));
    },
    onSettled: () => {
      setUploadingSlot(null);
    },
  });

  const uploadedCount = useMemo(() => {
    if (!handover?.photoRequired) {
      return 0;
    }
    return HANDOVER_SLOTS.filter((slot) => handover.photos?.[slot]).length;
  }, [handover]);

  const pickAndUpload = async (slot: HandoverPhotoSlot) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showError(t('handover.permissionRequired'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }

    const asset = result.assets[0];
    setUploadingSlot(slot);
    uploadMutation.mutate({
      slot,
      uri: asset.uri,
      name: asset.fileName ?? `handover-${slot}-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
  };

  if (!vehicleId) {
    return (
      <ScreenLayout title={t('handover.title')} subtitle={t('handover.subtitle')}>
        <ErrorState message={t('handover.validationVehicle')} onRetry={() => router.back()} />
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title={t('handover.title')} subtitle={t('handover.subtitle')}>
      {isLoading ? <LoadingState label={t('common.loading')} /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, t('handover.loadFailed'))}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && handover ? (
        <View style={styles.content}>
          <Text style={styles.banner}>
            {handover.photoRequired ? t('handover.vehicleChanged') : t('handover.sameVehicle')}
          </Text>
          {handover.vehicle?.plateNumber ? (
            <Text style={styles.plate}>{handover.vehicle.plateNumber}</Text>
          ) : null}

          {handover.photoRequired ? (
            <>
              <Text style={styles.progress}>
                {handover.photosComplete
                  ? t('handover.allComplete')
                  : t('handover.progress', { done: uploadedCount, total: HANDOVER_SLOTS.length })}
              </Text>
              <View style={styles.grid}>
                {HANDOVER_SLOTS.map((slot) => {
                  const photo = handover.photos?.[slot];
                  const isUploading = uploadingSlot === slot && uploadMutation.isPending;

                  return (
                    <View key={slot} style={styles.slotCard}>
                      <Text style={styles.slotTitle}>{slotLabel(t, slot)}</Text>
                      {photo?.fileUrl ? (
                        <Image source={{ uri: photo.fileUrl }} style={styles.preview} resizeMode="cover" />
                      ) : (
                        <View style={styles.previewPlaceholder}>
                          <Feather name="camera" size={28} color={colors.subtext} />
                        </View>
                      )}
                      <Pressable
                        style={[styles.slotButton, isUploading && styles.slotButtonDisabled]}
                        onPress={() => {
                          void pickAndUpload(slot);
                        }}
                        disabled={isUploading}
                      >
                        <Text style={styles.slotButtonText}>
                          {isUploading
                            ? t('handover.uploadingSlot', { slot: slotLabel(t, slot) })
                            : photo
                              ? t('handover.replacePhoto')
                              : t('handover.addPhoto')}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <Text style={styles.doneHint}>{t('handover.sameVehicle')}</Text>
          )}
        </View>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  banner: {
    ...typography.bodyMedium,
    color: colors.primary,
  },
  plate: {
    ...typography.h3,
  },
  progress: {
    color: colors.subtext,
    fontSize: 14,
  },
  doneHint: {
    color: colors.subtext,
    fontSize: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  slotCard: {
    width: '47%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  slotTitle: {
    ...typography.bodyMedium,
    fontWeight: '600',
  },
  preview: {
    width: '100%',
    height: 100,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  previewPlaceholder: {
    width: '100%',
    height: 100,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  slotButtonDisabled: {
    opacity: 0.6,
  },
  slotButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
  },
});
