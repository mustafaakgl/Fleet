import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Alert, Platform, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi, fleetTripApi } from '@/api/endpoints';
import { fleetTripStore } from '@/features/fleet/store';
import {
  formatDistanceKm,
  formatElapsedDuration,
  formatSpeedKmh,
} from '@/features/fleet/trip-stats.util';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, shadows, spacing, typography } from '@/theme';

export default function FleetTripScreen() {
  const { t } = useTranslation();
  const initialize = fleetTripStore((state) => state.initialize);
  const hydrateActiveTrip = fleetTripStore((state) => state.hydrateActiveTrip);
  const refreshActiveTrip = fleetTripStore((state) => state.refreshActiveTrip);
  const startTrip = fleetTripStore((state) => state.startTrip);
  const stopTrip = fleetTripStore((state) => state.stopTrip);
  const activeTrip = fleetTripStore((state) => state.activeTrip);
  const loading = fleetTripStore((state) => state.loading);
  const busy = fleetTripStore((state) => state.busy);
  const queuedCount = fleetTripStore((state) => state.queuedCount);
  const uploadError = fleetTripStore((state) => state.uploadError);
  const permissionDenied = fleetTripStore((state) => state.permissionDenied);
  const watcherActive = fleetTripStore((state) => state.watcherActive);
  const liveDistanceKm = fleetTripStore((state) => state.liveDistanceKm);
  const liveSpeedKmh = fleetTripStore((state) => state.liveSpeedKmh);
  const elapsedS = fleetTripStore((state) => state.elapsedS);

  const { data: me } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
  });
  const { data: driverScore, refetch: refetchScore } = useQuery({
    queryKey: ['fleet-driver-score'],
    queryFn: () => fleetTripApi.getScore(),
    enabled: Platform.OS !== 'web',
  });

  const vehicle =
    me?.driver.assignedVehicle ?? me?.driver.todayAssignment?.vehicle ?? null;

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }
    initialize();
    void hydrateActiveTrip();
  }, [hydrateActiveTrip, initialize]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') {
        return;
      }
      void refreshActiveTrip();
      void refetchScore();
    }, [refreshActiveTrip, refetchScore]),
  );

  if (Platform.OS === 'web') {
    return (
      <ScreenLayout title={t('fleetTrip.title')} subtitle={t('fleetTrip.subtitle')}>
        <View style={styles.card}>
          <Text style={styles.hint}>{t('fleetTrip.webOnlyNative')}</Text>
          <ActionButton
            label={t('location.webOpenToday')}
            onPress={() => router.replace('/(app)/today')}
            variant="primary"
          />
        </View>
      </ScreenLayout>
    );
  }

  const tripActive = activeTrip?.status === 'active';
  const statusColor = tripActive && watcherActive ? colors.success : colors.muted;
  const statusText = tripActive
    ? watcherActive
      ? t('fleetTrip.statusActive')
      : t('fleetTrip.statusWaitingGps')
    : t('fleetTrip.statusIdle');

  const confirmStopTrip = () => {
    Alert.alert(t('fleetTrip.stopConfirmTitle'), t('fleetTrip.stopConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('fleetTrip.stopTrip'),
        style: 'destructive',
        onPress: () => {
          void stopTrip();
        },
      },
    ]);
  };

  return (
    <ScreenLayout
      title={t('fleetTrip.title')}
      subtitle={t('fleetTrip.subtitle')}
      onRefresh={() => {
        void refreshActiveTrip();
        void refetchScore();
      }}
    >
      <View style={styles.card}>
        <View style={styles.header}>
          <Feather name="map-pin" size={18} color={colors.accent} />
          <Text style={styles.title}>{vehicle?.plateNumber ?? t('fleetTrip.noVehicle')}</Text>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
        </View>

        {vehicle ? (
          <Text style={styles.meta}>
            {vehicle.brand} {vehicle.model}
          </Text>
        ) : (
          <Text style={styles.warn}>{t('fleetTrip.noVehicleHint')}</Text>
        )}

        {loading && !activeTrip ? <LoadingState label={t('common.loading')} /> : null}

        <>
          <Text style={styles.status}>{statusText}</Text>
          {permissionDenied ? (
            <Text style={styles.error}>{t('location.permissionDenied')}</Text>
          ) : null}
          {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}

          <View style={styles.statsGrid}>
            <StatTile label={t('fleetTrip.elapsed')} value={formatElapsedDuration(elapsedS)} />
            <StatTile label={t('fleetTrip.distance')} value={formatDistanceKm(liveDistanceKm)} />
            <StatTile label={t('fleetTrip.speed')} value={formatSpeedKmh(liveSpeedKmh)} />
            <StatTile label={t('fleetTrip.queue')} value={String(queuedCount)} />
          </View>

          {!tripActive ? (
            <ActionButton
              label={busy ? t('common.loading') : t('fleetTrip.startTrip')}
              onPress={() => {
                if (!vehicle?.id) {
                  return;
                }
                void startTrip(vehicle.id);
              }}
              disabled={busy || !vehicle?.id}
              variant="primary"
            />
          ) : (
            <ActionButton
              label={busy ? t('common.loading') : t('fleetTrip.stopTrip')}
              onPress={confirmStopTrip}
              disabled={busy}
              variant="danger"
            />
          )}
        </>
      </View>

      <Text style={styles.footerHint}>{t('fleetTrip.footerHint')}</Text>

      {driverScore ? (
        <View style={styles.scoreCard}>
          <Text style={styles.scoreTitle}>{t('fleetTrip.scoreTitle')}</Text>
          <Text style={styles.scoreValue}>{Math.round(driverScore.score)}</Text>
          <View style={styles.scoreEvents}>
            <Text style={styles.scoreMeta}>
              {t('fleetTrip.eventSpeeding')}: {driverScore.events.speeding}
            </Text>
            <Text style={styles.scoreMeta}>
              {t('fleetTrip.eventHarshAccel')}: {driverScore.events.harsh_accel}
            </Text>
            <Text style={styles.scoreMeta}>
              {t('fleetTrip.eventHarshBrake')}: {driverScore.events.harsh_brake}
            </Text>
          </View>
          <Text style={styles.scoreMeta}>
            {t('fleetTrip.scoreTrips', { count: driverScore.tripCount })}
          </Text>
        </View>
      ) : null}
    </ScreenLayout>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statTile}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    ...typography.h3,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  meta: {
    ...typography.caption,
    textTransform: 'none',
    color: colors.subtext,
  },
  hint: {
    color: colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  status: {
    ...typography.bodyMedium,
    color: colors.primary,
  },
  warn: {
    color: colors.warning,
    fontSize: 12,
  },
  error: {
    color: colors.danger,
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  statTile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 4,
  },
  statLabel: {
    ...typography.caption,
    textTransform: 'uppercase',
  },
  statValue: {
    ...typography.h3,
    fontSize: 20,
  },
  footerHint: {
    marginTop: spacing.md,
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  scoreCard: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  scoreTitle: {
    ...typography.h3,
  },
  scoreValue: {
    fontSize: 42,
    fontWeight: '800',
    color: colors.primary,
  },
  scoreEvents: {
    gap: 4,
  },
  scoreMeta: {
    ...typography.caption,
    textTransform: 'none',
    color: colors.subtext,
  },
});
