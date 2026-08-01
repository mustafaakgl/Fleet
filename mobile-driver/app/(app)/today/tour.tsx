import { Stack } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ScreenLayout } from '@/components/ScreenLayout';
import { Card } from '@/components/ui/Card';
import { ActionButton } from '@/components/ActionButton';
import { SkeletonCard } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { StatusBadge } from '@/components/StatusBadge';
import { driverApi } from '@/api/endpoints';
import { localTodayDate } from '@/lib/calendar-date';
import { buildNavigationUrl, type MobilePlatform } from '@/lib/navigation-links';
import { openExternalUrl } from '@/lib/maps';
import { getErrorMessage } from '@/utils/errors';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, spacing, typography } from '@/theme';
import type { DriverTourStop } from '@/api/types';

function currentPlatform(): MobilePlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

function stopLabel(stop: DriverTourStop): string {
  return [stop.street, [stop.postalCode, stop.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
    .trim() || stop.address;
}

export default function TourScreen() {
  const { t } = useTranslation();
  const platform = currentPlatform();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-tour', localTodayDate()],
    queryFn: () => driverApi.todayTour(localTodayDate()),
    retry: false,
  });

  const tour = data?.tour ?? null;

  async function navigateTo(stop: DriverTourStop) {
    if (stop.latitude === null || stop.longitude === null) return;
    const url = buildNavigationUrl(
      { latitude: stop.latitude, longitude: stop.longitude, label: stopLabel(stop) },
      platform,
    );
    if (url) {
      await openExternalUrl(url);
    }
  }

  return (
    <ScreenLayout title={t('tour.title')}>
      <Stack.Screen options={{ title: t('tour.title') }} />

      {isLoading ? (
        <SkeletonCard />
      ) : error ? (
        <ErrorState message={getErrorMessage(error, t('common.error'))} onRetry={refetch} />
      ) : !tour ? (
        <Card>
          <Text style={styles.emptyText}>{t('tour.empty')}</Text>
        </Card>
      ) : (
        <>
          <Card>
            <View style={styles.headerRow}>
              <Text style={styles.tourName}>{tour.name ?? t('tour.title')}</Text>
              <StatusBadge label={t(`tour.status.${tour.status}`)} tone="neutral" />
            </View>
            <Text style={styles.summary}>
              {t('tour.summary', {
                stops: tour.stops.length,
                km: tour.plannedDistanceKm?.toFixed(0) ?? '–',
                minutes: tour.plannedDurationMin ?? '–',
              })}
            </Text>
          </Card>

          {tour.stops.map((stop) => {
            const navigable = stop.latitude !== null && stop.longitude !== null;
            return (
              <Card key={stop.id} style={styles.stopCard}>
                <View style={styles.headerRow}>
                  <Text style={styles.sequence}>{stop.sequence}</Text>
                  <Text style={styles.kind}>{t(`tour.kind.${stop.kind}`)}</Text>
                </View>

                <Text style={styles.address}>{stopLabel(stop)}</Text>

                {stop.windowStart && stop.windowEnd ? (
                  <Text style={styles.meta}>
                    {t('tour.window', { from: stop.windowStart, to: stop.windowEnd })}
                  </Text>
                ) : null}

                {stop.legDistanceKm !== null ? (
                  <Text style={styles.meta}>
                    {t('tour.legDistance', { km: stop.legDistanceKm.toFixed(1) })}
                  </Text>
                ) : null}

                {/* Kamyon erisimi dogrulanmamis duraklarda surucu uyarilir.
                    Navigasyon yine de acilir — uyari engel degil, bilgi. */}
                {stop.truckAccess === 'unreachable' ? (
                  <Text style={styles.warning}>{t('tour.truckWarning.unreachable')}</Text>
                ) : stop.truckAccess !== 'reachable' ? (
                  <Text style={styles.notice}>{t('tour.truckWarning.unverified')}</Text>
                ) : null}

                <ActionButton
                  label={t('tour.navigate')}
                  onPress={() => void navigateTo(stop)}
                  disabled={!navigable}
                />
                {!navigable ? <Text style={styles.notice}>{t('tour.noCoordinates')}</Text> : null}
              </Card>
            );
          })}
        </>
      )}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  tourName: { ...typography.h3, color: colors.text, flexShrink: 1 },
  summary: { ...typography.body, color: colors.subtext },
  stopCard: { marginTop: spacing.sm },
  sequence: { ...typography.h3, color: colors.primary },
  kind: { ...typography.caption, color: colors.subtext, textTransform: 'uppercase' },
  address: { ...typography.body, color: colors.text, marginBottom: spacing.xs },
  meta: { ...typography.caption, color: colors.subtext },
  warning: { ...typography.caption, color: colors.danger, marginTop: spacing.xs },
  notice: { ...typography.caption, color: colors.warning, marginTop: spacing.xs },
  emptyText: { ...typography.body, color: colors.subtext },
});
