import { useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { driverApi } from '@/api/endpoints';
import type { DepartureCheckItemStatus } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { colors, radius, spacing } from '@/theme';

type PickedPhoto = { uri: string; name: string; type: string };
type ItemState = {
  result: DepartureCheckItemStatus;
  defect_description?: string;
  defect_severity?: 'gering' | 'mittel' | 'kritisch';
  photos?: PickedPhoto[];
};

export default function DepartureCheckScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, ItemState>>({});
  const [confirmed, setConfirmed] = useState(false);

  const { data: status, isLoading, error, refetch } = useQuery({
    queryKey: ['departure-check-status'],
    queryFn: () => driverApi.departureCheckStatus(),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!status?.assignment || !status.template) throw new Error('Missing assignment');
      const items = status.template.items.map((item) => {
        const answer = answers[item.item_key];
        if (!answer) throw new Error(`Missing answer for ${item.item_key}`);
        return {
          item_key: item.item_key,
          result: answer.result,
          defect_description: answer.defect_description,
          defect_severity: answer.defect_severity,
        };
      });

      let latitude: number | undefined;
      let longitude: number | undefined;
      let accuracy_m: number | undefined;
      try {
        const { status: locStatus } = await Location.requestForegroundPermissionsAsync();
        if (locStatus === 'granted') {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          latitude = position.coords.latitude;
          longitude = position.coords.longitude;
          accuracy_m = position.coords.accuracy ?? undefined;
        }
      } catch {
        // optional GPS
      }

      const photosByItemKey: Record<string, PickedPhoto[]> = {};
      for (const item of status.template.items) {
        const photos = answers[item.item_key]?.photos ?? [];
        if (photos.length) photosByItemKey[item.item_key] = photos;
      }

      return driverApi.submitDepartureCheck({
        vehicle_id: status.assignment.vehicle_id,
        assignment_id: status.assignment.id,
        client_submission_id: `mobile-${Date.now()}`,
        items,
        latitude,
        longitude,
        accuracy_m,
        signature_confirmed_at: new Date().toISOString(),
        photosByItemKey,
      });
    },
    onSuccess: async () => {
      showSuccess(t('departureCheck.submitSuccess'));
      await queryClient.invalidateQueries({ queryKey: ['departure-check-status'] });
      router.back();
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('departureCheck.submitFailed')));
    },
  });

  const allAnswered = useMemo(() => {
    if (!status?.template) return false;
    return status.template.items.every((item) => answers[item.item_key]?.result);
  }, [answers, status?.template]);

  async function pickPhoto(itemKey: string) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      showError(t('departureCheck.cameraDenied'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const photo: PickedPhoto = {
      uri: asset.uri,
      name: asset.fileName ?? `defect-${itemKey}-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    };
    setAnswers((prev) => ({
      ...prev,
      [itemKey]: {
        ...prev[itemKey],
        photos: [...(prev[itemKey]?.photos ?? []), photo],
      },
    }));
  }

  function setResult(itemKey: string, result: DepartureCheckItemStatus) {
    setAnswers((prev) => ({
      ...prev,
      [itemKey]: { ...prev[itemKey], result },
    }));
  }

  if (isLoading) return <LoadingState label={t('common.loading')} />;
  if (error) {
    return (
      <ErrorState
        message={getErrorMessage(error, t('departureCheck.loadError'))}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  if (!status?.required) {
    return (
      <ScreenLayout title={t('departureCheck.title')} subtitle={t('departureCheck.subtitle')}>
        <Text style={styles.empty}>{t('departureCheck.notRequired')}</Text>
      </ScreenLayout>
    );
  }

  if (status.completed_today) {
    return (
      <ScreenLayout title={t('departureCheck.title')} subtitle={t('departureCheck.subtitle')}>
        <Text style={styles.empty}>{t('departureCheck.alreadyDone')}</Text>
      </ScreenLayout>
    );
  }

  if (!status.can_submit) {
    return (
      <ScreenLayout title={t('departureCheck.title')} subtitle={t('departureCheck.subtitle')}>
        <Text style={styles.blocked}>{t('departureCheck.blocked')}</Text>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title={t('departureCheck.title')} subtitle={status.assignment?.vehicle_plate ?? ''}>
      <View style={styles.metaCard}>
        <Text style={styles.metaText}>{status.assignment?.company_name}</Text>
        <Text style={styles.metaSub}>{status.template?.name}</Text>
      </View>

      {status.template?.items.map((item) => {
        const answer = answers[item.item_key];
        return (
          <View key={item.id} style={styles.itemCard}>
            <Text style={styles.itemLabel}>{item.label}</Text>
            {item.description ? <Text style={styles.itemDesc}>{item.description}</Text> : null}
            <View style={styles.resultRow}>
              {(['ok', 'defekt', 'na'] as DepartureCheckItemStatus[]).map((result) => (
                <Pressable
                  key={result}
                  style={[styles.resultChip, answer?.result === result && styles.resultChipActive]}
                  onPress={() => setResult(item.item_key, result)}
                >
                  <Text style={[styles.resultText, answer?.result === result && styles.resultTextActive]}>
                    {t(`departureCheck.result.${result}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {answer?.result === 'defekt' ? (
              <View style={styles.defectBox}>
                <TextInput
                  style={styles.input}
                  placeholder={t('departureCheck.defectDescription')}
                  value={answer.defect_description ?? ''}
                  onChangeText={(text) =>
                    setAnswers((prev) => ({
                      ...prev,
                      [item.item_key]: { ...prev[item.item_key], defect_description: text },
                    }))
                  }
                />
                <View style={styles.resultRow}>
                  {(['gering', 'mittel', 'kritisch'] as const).map((severity) => (
                    <Pressable
                      key={severity}
                      style={[
                        styles.resultChip,
                        answer.defect_severity === severity && styles.resultChipActive,
                      ]}
                      onPress={() =>
                        setAnswers((prev) => ({
                          ...prev,
                          [item.item_key]: { ...prev[item.item_key], defect_severity: severity },
                        }))
                      }
                    >
                      <Text
                        style={[
                          styles.resultText,
                          answer.defect_severity === severity && styles.resultTextActive,
                        ]}
                      >
                        {t(`departureCheck.severity.${severity}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {item.requires_photo_on_defect ? (
                  <ActionButton
                    label={t('departureCheck.addPhoto')}
                    onPress={() => {
                      void pickPhoto(item.item_key);
                    }}
                  />
                ) : null}
                {(answer.photos ?? []).map((photo, index) => (
                  <Image key={`${photo.uri}-${index}`} source={{ uri: photo.uri }} style={styles.thumb} />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      <Pressable style={styles.confirmRow} onPress={() => setConfirmed((value) => !value)}>
        <Feather name={confirmed ? 'check-square' : 'square'} size={20} color={colors.accent} />
        <Text style={styles.confirmText}>{t('departureCheck.confirmLabel')}</Text>
      </Pressable>

      <ActionButton
        label={submitMutation.isPending ? t('departureCheck.submitting') : t('departureCheck.submit')}
        onPress={() => submitMutation.mutate()}
        disabled={!allAnswered || !confirmed || submitMutation.isPending}
        variant="primary"
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  blocked: { color: colors.danger, textAlign: 'center', marginTop: spacing.xl, lineHeight: 20 },
  metaCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaText: { fontWeight: '700', color: colors.text },
  metaSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  itemCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  itemLabel: { fontWeight: '700', color: colors.text },
  itemDesc: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  resultRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  resultChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  resultChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  resultText: { fontSize: 12, fontWeight: '600', color: colors.subtext },
  resultTextActive: { color: colors.accent },
  defectBox: { gap: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  thumb: { width: '100%', height: 120, borderRadius: radius.sm },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  confirmText: { flex: 1, color: colors.text, fontSize: 14 },
});
