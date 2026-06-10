import { useMemo, useState } from 'react';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LicenseCameraModal } from '@/components/LicenseCameraModal';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { driverApi } from '@/api/endpoints';
import type { LicenseCheckPhotoMeta, LicenseCheckStep } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { colors, radius, shadows, spacing } from '@/theme';

type PickedImage = { uri: string; name: string; type: string; meta: LicenseCheckPhotoMeta };

const STEPS: LicenseCheckStep[] = ['front', 'back', 'selfie'];

function stepTitle(t: (key: string) => string, step: LicenseCheckStep): string {
  if (step === 'front') return t('licenseCheck.stepFront');
  if (step === 'back') return t('licenseCheck.stepBack');
  return t('licenseCheck.stepSelfie');
}

async function captureMeta(): Promise<LicenseCheckPhotoMeta> {
  const captured_at = new Date().toISOString();
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      return { captured_at };
    }
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return {
      captured_at,
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy_m: position.coords.accuracy ?? undefined,
    };
  } catch {
    return { captured_at };
  }
}

export default function LicenseCheckScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const [shots, setShots] = useState<Partial<Record<LicenseCheckStep, PickedImage>>>({});
  const [cameraOpen, setCameraOpen] = useState(false);

  const currentStep = STEPS[stepIndex];

  const { data: status, isLoading, error, refetch } = useQuery({
    queryKey: ['license-check-status'],
    queryFn: () => driverApi.licenseCheckStatus(),
  });

  const submitMutation = useMutation({
    mutationFn: () => {
      const front = shots.front;
      const back = shots.back;
      const selfie = shots.selfie;
      if (!front || !back || !selfie) {
        throw new Error('Missing photos');
      }
      return driverApi.submitLicenseCheck({
        front,
        back,
        selfie,
        photoMetadata: {
          front: front.meta,
          back: back.meta,
          selfie: selfie.meta,
        },
      });
    },
    onSuccess: async () => {
      showSuccess(t('licenseCheck.submitSuccess'));
      await queryClient.invalidateQueries({ queryKey: ['license-check-status'] });
      await queryClient.invalidateQueries({ queryKey: ['license-check-history'] });
      router.back();
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('licenseCheck.submitFailed')));
    },
  });

  const progressLabel = useMemo(
    () => t('licenseCheck.progress', { current: String(stepIndex + 1), total: String(STEPS.length) }),
    [stepIndex, t],
  );

  async function handleCaptured(result: { uri: string; name: string; type: string }) {
    const meta = await captureMeta();
    setShots((prev) => ({
      ...prev,
      [currentStep]: {
        uri: result.uri,
        name: result.name,
        type: result.type,
        meta,
      },
    }));
  }

  function goNext() {
    if (!shots[currentStep]) {
      showError(t('licenseCheck.photoRequired'));
      return;
    }
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((value) => value + 1);
      return;
    }
    submitMutation.mutate();
  }

  if (isLoading) {
    return <LoadingState label={t('licenseCheck.loading')} />;
  }

  if (error) {
    return (
      <ErrorState
        message={getErrorMessage(error, t('licenseCheck.loadError'))}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (!status?.can_submit) {
    return (
      <ScreenLayout title={t('licenseCheck.title')} subtitle={t('licenseCheck.subtitle')}>
        <View style={styles.infoCard}>
          <Feather name="check-circle" size={28} color={colors.success} />
          <Text style={styles.infoTitle}>{t('licenseCheck.nothingDue')}</Text>
          <Text style={styles.infoText}>{t('licenseCheck.nothingDueHint')}</Text>
          <ActionButton
            label={t('licenseCheck.viewHistory')}
            onPress={() => router.push('/(app)/profile/license-history')}
          />
        </View>
      </ScreenLayout>
    );
  }

  const preview = shots[currentStep];

  return (
    <ScreenLayout title={t('licenseCheck.title')} subtitle={progressLabel}>
      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>{stepTitle(t, currentStep)}</Text>
        <Text style={styles.stepHint}>
          {currentStep === 'selfie' ? t('licenseCheck.selfieHint') : t('licenseCheck.cardHint')}
        </Text>

        <Pressable style={styles.previewBox} onPress={() => setCameraOpen(true)}>
          {preview ? (
            <Image source={{ uri: preview.uri }} style={styles.previewImage} />
          ) : (
            <View style={styles.previewPlaceholder}>
              <Feather name="camera" size={32} color={colors.muted} />
              <Text style={styles.previewPlaceholderText}>{t('licenseCheck.openCamera')}</Text>
            </View>
          )}
        </Pressable>

        {preview ? (
          <Pressable onPress={() => setCameraOpen(true)}>
            <Text style={styles.retakeLink}>{t('licenseCheck.retake')}</Text>
          </Pressable>
        ) : null}

        {preview?.meta ? (
          <Text style={styles.metaText}>
            {preview.meta.captured_at}
            {preview.meta.latitude != null
              ? ` · ${preview.meta.latitude.toFixed(5)}, ${preview.meta.longitude?.toFixed(5)}`
              : ''}
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        {stepIndex > 0 ? (
          <ActionButton
            label={t('licenseCheck.back')}
            variant="secondary"
            onPress={() => setStepIndex((value) => value - 1)}
          />
        ) : null}
        <ActionButton
          label={stepIndex === STEPS.length - 1 ? t('licenseCheck.submit') : t('licenseCheck.next')}
          onPress={() => goNext()}
          loading={submitMutation.isPending}
        />
      </View>

      <LicenseCameraModal
        visible={cameraOpen}
        mode={currentStep === 'selfie' ? 'selfie' : 'card'}
        onClose={() => setCameraOpen(false)}
        onCaptured={(result) => {
          void handleCaptured(result);
        }}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  stepCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  stepHint: {
    fontSize: 14,
    color: colors.muted,
    lineHeight: 20,
  },
  previewBox: {
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 220,
  },
  previewImage: {
    width: '100%',
    height: 240,
  },
  previewPlaceholder: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background,
  },
  previewPlaceholderText: {
    color: colors.muted,
    fontSize: 14,
  },
  retakeLink: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  metaText: {
    fontSize: 11,
    color: colors.muted,
  },
  actions: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.md,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
