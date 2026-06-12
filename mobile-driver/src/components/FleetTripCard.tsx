import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { fleetTripStore } from '@/features/fleet/store';
import { formatDistanceKm, formatElapsedDuration } from '@/features/fleet/trip-stats.util';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, shadows, spacing, typography } from '@/theme';

export function FleetTripCard() {
  const { t } = useTranslation();
  const activeTrip = fleetTripStore((state) => state.activeTrip);
  const elapsedS = fleetTripStore((state) => state.elapsedS);
  const liveDistanceKm = fleetTripStore((state) => state.liveDistanceKm);
  const queuedCount = fleetTripStore((state) => state.queuedCount);

  if (Platform.OS === 'web') {
    return null;
  }

  const tripActive = activeTrip?.status === 'active';

  return (
    <Pressable style={styles.card} onPress={() => router.push('/(app)/today/trip')}>
      <View style={styles.header}>
        <Feather name="navigation-2" size={18} color={colors.accent} />
        <Text style={styles.title}>{t('fleetTrip.compactTitle')}</Text>
        <Feather name="chevron-right" size={18} color={colors.muted} />
      </View>
      <Text style={styles.hint}>{t('fleetTrip.compactHint')}</Text>
      {tripActive ? (
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{formatElapsedDuration(elapsedS)}</Text>
          <Text style={styles.meta}>{formatDistanceKm(liveDistanceKm)}</Text>
          {queuedCount > 0 ? (
            <Text style={styles.queue}>{t('fleetTrip.queuePending', { count: queuedCount })}</Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
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
  hint: {
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  meta: {
    ...typography.bodyMedium,
    color: colors.primary,
  },
  queue: {
    color: colors.warning,
    fontSize: 12,
  },
});
