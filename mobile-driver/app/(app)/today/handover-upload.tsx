import { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { HandoverCameraModal } from '@/components/HandoverCameraModal';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import type { HandoverPhotoSlot } from '@/api/types';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { useTranslation } from '@/i18n/useTranslation';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { colors, radius, spacing, typography } from '@/theme';
import { localTodayDate } from '@/lib/calendar-date';
import { resolveHandoverSlots } from '@/lib/handover-photos';
import { buildHandoverPhotoMetadata } from '@/lib/handover-photo-metadata';

function slotLabel(t: (key: string) => string, slot: HandoverPhotoSlot): string {
  if (slot === 'front') return t('handover.slotFront');
  if (slot === 'right') return t('handover.slotRight');
  if (slot === 'left') return t('handover.slotLeft');
  if (slot === 'rear') return t('handover.slotRear');
  if (slot === 'tail_lift') return t('handover.slotTailLift');
  return t('handover.slotInterior');
}

type PickedImage = { uri: string; name: string; type: string };

export default function VehicleHandoverUploadScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ assignmentId?: string; vehicleId?: string }>();
  const vehicleId = params.vehicleId ?? '';
  const assignmentId = params.assignmentId ?? '';
  const [uploadingSlot, setUploadingSlot] = useState<HandoverPhotoSlot | null>(null);
  const [cameraSlot, setCameraSlot] = useState<HandoverPhotoSlot | null>(null);
  const [firstAidKit, setFirstAidKit] = useState(false);
  const [fireExtinguisher, setFireExtinguisher] = useState(false);
  const [straps, setStraps] = useState(false);
  const [safetyVest, setSafetyVest] = useState(false);
  const [equipmentNotes, setEquipmentNotes] = useState('');
  const [damageDetected, setDamageDetected] = useState(false);
  const [damageNotes, setDamageNotes] = useState('');
  const [inventoryQuantities, setInventoryQuantities] = useState<Record<string, string>>({});

  const {
    data: handover,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['driver-handover', vehicleId, assignmentId, localTodayDate()],
    enabled: Boolean(vehicleId),
    queryFn: async () => {
      const list = await driverApi.listHandovers({ date: localTodayDate() });
      const existing = list.find(
        (row) => row.vehicleId === vehicleId && row.assignmentId === (assignmentId || null),
      );
      if (existing) {
        return driverApi.getHandover(existing.id);
      }
      try {
        return await driverApi.createHandover({
          vehicleId,
          assignmentId: assignmentId || undefined,
          handoverType: 'pickup',
        });
      } catch (createError) {
        if (
          assignmentId &&
          axios.isAxiosError(createError) &&
          createError.response?.status === 404
        ) {
          return driverApi.createHandover({
            vehicleId,
            handoverType: 'pickup',
          });
        }
        throw createError;
      }
    },
  });

  useEffect(() => {
    if (!handover) return;
    setDamageDetected(handover.damageDetected ?? false);
    setDamageNotes(handover.damageNotes ?? '');
    if (handover.equipmentChecklist) {
      setFirstAidKit(handover.equipmentChecklist.firstAidKit);
      setFireExtinguisher(handover.equipmentChecklist.fireExtinguisher);
      setStraps(handover.equipmentChecklist.straps);
      setSafetyVest(handover.equipmentChecklist.safetyVest);
      setEquipmentNotes(handover.equipmentChecklist.notes);
      const nextInventory: Record<string, string> = {};
      for (const row of handover.equipmentChecklist.inventoryChecks ?? []) {
        nextInventory[row.equipmentId] = String(row.quantityPresent);
      }
      for (const item of handover.equipmentChecklist.vehicleEquipment ?? []) {
        if (nextInventory[item.id] === undefined) {
          nextInventory[item.id] = String(item.expectedQuantity);
        }
      }
      setInventoryQuantities(nextInventory);
    }
  }, [handover?.id]);

  const requiredSlots = useMemo(
    () => resolveHandoverSlots(handover?.requiredPhotoSlots),
    [handover?.requiredPhotoSlots],
  );

  const uploadMutation = useMutation({
    mutationFn: async ({
      slot,
      uri,
      name,
      type,
      metadata,
    }: {
      slot: HandoverPhotoSlot;
      uri: string;
      name: string;
      type: string;
      metadata: Awaited<ReturnType<typeof buildHandoverPhotoMetadata>>;
    }) => {
      if (!handover?.id) {
        throw new Error('Handover not ready');
      }
      return driverApi.uploadHandoverPhoto(
        handover.id,
        slot,
        { uri, name, type },
        {
          takenAt: metadata.takenAt,
          gpsLat: metadata.gpsLat,
          gpsLng: metadata.gpsLng,
          deviceInfo: metadata.deviceInfo,
        },
      );
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

  const checklistMutation = useMutation({
    mutationFn: () => {
      if (!handover?.id) {
        throw new Error('Handover not ready');
      }
      return driverApi.submitHandoverEquipmentChecklist(handover.id, {
        firstAidKit,
        fireExtinguisher,
        straps,
        safetyVest,
        notes: equipmentNotes.trim() || undefined,
        damageDetected,
        damageNotes: damageDetected ? damageNotes.trim() || undefined : undefined,
        inventoryChecks:
          (handover.equipmentChecklist?.vehicleEquipment ?? []).length > 0
            ? (handover.equipmentChecklist?.vehicleEquipment ?? []).map((item) => ({
                equipmentId: item.id,
                quantityPresent: Number.parseInt(inventoryQuantities[item.id] ?? '0', 10) || 0,
              }))
            : undefined,
      });
    },
    onSuccess: async () => {
      showSuccess(t('handover.equipmentSaved'));
      await queryClient.invalidateQueries({ queryKey: ['driver-handover', vehicleId, assignmentId] });
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('handover.equipmentFailed')));
    },
  });

  const uploadedCount = useMemo(() => {
    if (!handover?.photoRequired) {
      return 0;
    }
    return requiredSlots.filter((slot) => handover.photos?.[slot]).length;
  }, [handover, requiredSlots]);

  const uploadAsset = async (slot: HandoverPhotoSlot, asset: PickedImage) => {
    const metadata = await buildHandoverPhotoMetadata();
    setUploadingSlot(slot);
    uploadMutation.mutate({
      slot,
      uri: asset.uri,
      name: asset.name,
      type: asset.type,
      metadata,
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
              <View style={styles.damageCard}>
                <Text style={styles.slotTitle}>{t('handover.damageTitle')}</Text>
                <Text style={styles.scanHint}>{t('handover.damageHint')}</Text>
                <ChecklistRow
                  label={t('handover.damageDetected')}
                  value={damageDetected}
                  onChange={setDamageDetected}
                />
                {damageDetected ? (
                  <TextInput
                    style={styles.notesInput}
                    placeholder={t('handover.damageNotes')}
                    value={damageNotes}
                    onChangeText={setDamageNotes}
                    multiline
                  />
                ) : null}
              </View>

              <Text style={styles.scanHint}>{t('handover.cameraOnlyHint')}</Text>
              <Text style={styles.progress}>
                {handover.photosComplete
                  ? t('handover.allComplete')
                  : t('handover.progress', { done: uploadedCount, total: requiredSlots.length })}
              </Text>
              <View style={styles.grid}>
                {requiredSlots.map((slot) => {
                  const photo = handover.photos?.[slot];
                  const isUploading = uploadingSlot === slot && uploadMutation.isPending;

                  return (
                    <View key={slot} style={styles.slotCard}>
                      <Text style={styles.slotTitle}>{slotLabel(t, slot)}</Text>
                      {photo?.download_url || photo?.id ? (
                        <AuthenticatedImage
                          apiPath={
                            photo.download_url ?? `/driver/documents/${photo.id}/download`
                          }
                          style={styles.preview}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.previewPlaceholder}>
                          <Feather name="camera" size={28} color={colors.subtext} />
                        </View>
                      )}
                      <Pressable
                        style={[styles.slotButton, isUploading && styles.slotButtonDisabled]}
                        onPress={() => setCameraSlot(slot)}
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

              <View style={styles.checklistCard}>
                <Text style={styles.slotTitle}>{t('handover.equipmentTitle')}</Text>
                <ChecklistRow
                  label={t('handover.equipmentFirstAid')}
                  value={firstAidKit}
                  onChange={setFirstAidKit}
                />
                <ChecklistRow
                  label={t('handover.equipmentExtinguisher')}
                  value={fireExtinguisher}
                  onChange={setFireExtinguisher}
                />
                <ChecklistRow
                  label={t('handover.equipmentStraps')}
                  value={straps}
                  onChange={setStraps}
                />
                <ChecklistRow
                  label={t('handover.equipmentVest')}
                  value={safetyVest}
                  onChange={setSafetyVest}
                />
                <TextInput
                  style={styles.notesInput}
                  placeholder={t('handover.equipmentNotes')}
                  value={equipmentNotes}
                  onChangeText={setEquipmentNotes}
                />

                {(handover.equipmentChecklist?.vehicleEquipment ?? []).length > 0 ? (
                  <View style={styles.inventoryCard}>
                    <Text style={styles.slotTitle}>{t('handover.inventoryTitle')}</Text>
                    <Text style={styles.scanHint}>{t('handover.inventoryHint')}</Text>
                    {(handover.equipmentChecklist?.vehicleEquipment ?? []).map((item) => {
                      const entered = Number.parseInt(inventoryQuantities[item.id] ?? '', 10);
                      const mismatch =
                        Number.isFinite(entered) && entered !== item.expectedQuantity;
                      return (
                        <View key={item.id} style={styles.inventoryItem}>
                          <View style={styles.inventoryHeader}>
                            <Text style={styles.inventoryName}>{item.name}</Text>
                            <Text style={styles.scanHint}>
                              {t('handover.inventoryExpected', { count: item.expectedQuantity })}
                            </Text>
                          </View>
                          {item.photoDocumentId ? (
                            <AuthenticatedImage
                              apiPath={
                                item.photoDownloadUrl
                                  ?? `/driver/documents/${item.photoDocumentId}/download`
                              }
                              style={styles.inventoryPhoto}
                              resizeMode="cover"
                            />
                          ) : null}
                          <View style={styles.inventoryQtyRow}>
                            <Text style={styles.inventoryQtyLabel}>{t('handover.inventoryPresent')}</Text>
                            <TextInput
                              style={styles.inventoryQtyInput}
                              keyboardType="number-pad"
                              value={inventoryQuantities[item.id] ?? ''}
                              onChangeText={(value) =>
                                setInventoryQuantities((current) => ({ ...current, [item.id]: value }))
                              }
                            />
                          </View>
                          {mismatch ? (
                            <Text style={styles.inventoryMismatch}>{t('handover.inventoryMismatch')}</Text>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <Pressable
                  style={[styles.slotButton, checklistMutation.isPending && styles.slotButtonDisabled]}
                  onPress={() => checklistMutation.mutate()}
                  disabled={checklistMutation.isPending}
                >
                  <Text style={styles.slotButtonText}>
                    {checklistMutation.isPending
                      ? t('handover.equipmentSaving')
                      : t('handover.equipmentSave')}
                  </Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.doneHint}>{t('handover.sameVehicle')}</Text>
          )}
        </View>
      ) : null}

      <HandoverCameraModal
        visible={cameraSlot != null}
        slotLabel={cameraSlot ? slotLabel(t, cameraSlot) : ''}
        onClose={() => setCameraSlot(null)}
        onCaptured={(asset) => {
          if (!cameraSlot) return;
          void uploadAsset(cameraSlot, asset);
          setCameraSlot(null);
        }}
      />
    </ScreenLayout>
  );
}

function ChecklistRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.checklistRow}>
      <Text style={styles.checklistLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
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
  scanHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.subtext,
  },
  progress: {
    ...typography.caption,
    textTransform: 'none',
    color: colors.subtext,
  },
  grid: {
    gap: spacing.md,
  },
  slotCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
  },
  slotTitle: {
    ...typography.h3,
    fontSize: 15,
  },
  preview: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  previewPlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
  },
  slotButtonDisabled: {
    opacity: 0.6,
  },
  slotButtonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
  },
  doneHint: {
    color: colors.subtext,
    fontSize: 14,
  },
  checklistCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
  },
  damageCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.card,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  checklistLabel: {
    flex: 1,
    fontSize: 14,
    color: colors.primary,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.background,
  },
  inventoryCard: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  inventoryItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  inventoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inventoryName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  inventoryPhoto: {
    width: '100%',
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  inventoryQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  inventoryQtyLabel: {
    fontSize: 14,
    color: colors.primary,
  },
  inventoryQtyInput: {
    width: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.card,
    textAlign: 'center',
  },
  inventoryMismatch: {
    fontSize: 12,
    color: '#b45309',
  },
});
