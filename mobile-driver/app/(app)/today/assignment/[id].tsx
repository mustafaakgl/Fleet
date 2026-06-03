import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { SkeletonCard } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';
import { colors, spacing, typography } from '@/theme';
import { ActionButton } from '@/components/ActionButton';
import { RouteTimeline } from '@/components/RouteTimeline';
import { StatusBadge } from '@/components/StatusBadge';
import { Card } from '@/components/ui/Card';
import { useTranslation } from '@/i18n/useTranslation';

function assignmentTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'in_progress') return 'warning';
  return 'neutral';
}

export default function AssignmentDetailScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ id: string }>();
  const assignmentId = typeof params.id === 'string' ? params.id : '';
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => driverApi.assignmentById(assignmentId),
    enabled: Boolean(assignmentId),
  });

  return (
    <>
      <Stack.Screen options={{ title: t('assignment.title') }} />
      <ScreenLayout title={t('assignment.title')} subtitle={t('assignment.subtitle')}>
        {!assignmentId ? <ErrorState message="Missing assignment id." /> : null}
        {assignmentId && isLoading ? <SkeletonCard /> : null}
        {assignmentId && !isLoading && error ? (
          <ErrorState
            message={getErrorMessage(error, 'Failed to load assignment.')}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : null}
        {assignmentId && data ? (
          <>
            <Card>
              <View style={styles.rowBetween}>
                <Text style={styles.title}>{data.company.name}</Text>
                <StatusBadge label={data.status.replaceAll('_', ' ')} tone={assignmentTone(data.status)} />
              </View>
              <Text style={styles.row}>{data.vehicle.plateNumber}</Text>
            </Card>
            <Card>
              <Text style={styles.section}>{t('assignment.time')}</Text>
              <Text style={styles.row}>
                {data.startTime} – {data.endTime}
              </Text>
            </Card>
            <Card>
              <Text style={styles.section}>{t('assignment.cargo')}</Text>
              <Text style={styles.row}>{data.cargoName}</Text>
              <Text style={styles.subrow}>{data.cargoOwner}</Text>
            </Card>
            <RouteTimeline pickup={data.pickupAddress} delivery={data.deliveryAddress} />
            {data.notes ? (
              <Card>
                <Text style={styles.section}>{t('assignment.notes')}</Text>
                <Text style={styles.row}>{data.notes}</Text>
              </Card>
            ) : null}
            <View style={styles.actions}>
              <Text style={styles.section}>{t('assignment.actions')}</Text>
              <ActionButton label={t('home.morningCheckin')} onPress={() => router.push('/(app)/today/morning-checkin')} variant="primary" />
              <ActionButton
                label={t('home.handoverPhoto')}
                onPress={() =>
                  router.push(`/(app)/today/handover-upload?assignmentId=${data.id}&vehicleId=${data.vehicle.id}`)
                }
              />
              <ActionButton
                label={t('home.reportAccident')}
                onPress={() =>
                  router.push(`/(app)/today/accident-report?assignmentId=${data.id}&vehicleId=${data.vehicle.id}`)
                }
                variant="danger"
              />
              <ActionButton
                label={t('home.reportCargo')}
                onPress={() =>
                  router.push(`/(app)/today/cargo-damage-report?assignmentId=${data.id}&vehicleId=${data.vehicle.id}`)
                }
                variant="danger"
              />
            </View>
          </>
        ) : null}
      </ScreenLayout>
    </>
  );
}

const styles = StyleSheet.create({
  title: { ...typography.h2 },
  row: { color: colors.subtext, fontSize: 15, fontWeight: '600' },
  subrow: { color: colors.muted, fontSize: 14 },
  actions: { gap: spacing.sm },
  section: { ...typography.label },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
});
