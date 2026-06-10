import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { driverApi } from '@/api/endpoints';
import { driverDefectPhotoPath } from '@/lib/authenticated-files';
import { useTranslation } from '@/i18n/useTranslation';
import { formatAppDate } from '@/i18n/format';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { colors, radius, spacing } from '@/theme';

export default function DriverDefectDetailScreen() {
  const { t, locale } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: defects, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-defects'],
    queryFn: () => driverApi.listDefects(),
  });

  const defect = defects?.find((row) => row.id === id);

  const confirmMutation = useMutation({
    mutationFn: () => driverApi.confirmDefect(id),
    onSuccess: async () => {
      showSuccess(t('defects.confirmSuccess'));
      await queryClient.invalidateQueries({ queryKey: ['driver-defects'] });
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('defects.confirmFailed')));
    },
  });

  if (isLoading) return <LoadingState label={t('common.loading')} />;
  if (error || !defect) {
    return (
      <ErrorState
        message={getErrorMessage(error, t('defects.loadError'))}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('defects.detailTitle') }} />
      <ScreenLayout title={defect.title} subtitle={defect.vehicle.plate_number}>
        <ScrollView contentContainerStyle={styles.content}>
          {defect.pending_confirmation ? (
            <View style={styles.alertCard}>
              <Feather name="alert-circle" size={20} color={colors.warning} />
              <Text style={styles.alertText}>{t('defects.confirmRequired')}</Text>
            </View>
          ) : null}

          <View style={styles.card}>
            <Info label={t('defects.fieldStatus')} value={t(`defects.status.${defect.status}`)} />
            <Info label={t('defects.fieldSeverity')} value={t(`defects.severity.${defect.severity}`)} />
            <Info label={t('defects.fieldDate')} value={formatAppDate(locale, new Date(defect.created_at))} />
            <Info label={t('defects.fieldDescription')} value={defect.description} />
          </View>

          {defect.photo_urls && defect.photo_urls.length > 0 ? (
            <View style={styles.photos}>
              {defect.photo_urls.map((_, index) => (
                <AuthenticatedImage
                  key={index}
                  apiPath={driverDefectPhotoPath(defect.id, index)}
                  style={styles.photo}
                  resizeMode="cover"
                />
              ))}
            </View>
          ) : null}

          {defect.pending_confirmation ? (
            <ActionButton
              label={confirmMutation.isPending ? t('defects.confirming') : t('defects.confirm')}
              onPress={() => confirmMutation.mutate()}
              disabled={confirmMutation.isPending}
              variant="primary"
            />
          ) : defect.confirmed_at ? (
            <View style={styles.done}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={styles.doneText}>
                {t('defects.confirmedAt', { date: formatAppDate(locale, new Date(defect.confirmed_at)) })}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </ScreenLayout>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
  },
  alertText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoRow: { gap: 2 },
  infoLabel: { color: colors.muted, fontSize: 12 },
  infoValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  photos: { gap: spacing.sm },
  photo: { width: '100%', height: 180, borderRadius: radius.md },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  doneText: { color: colors.success, fontWeight: '600', flex: 1 },
});
