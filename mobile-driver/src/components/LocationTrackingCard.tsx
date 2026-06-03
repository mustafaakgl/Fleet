import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { locationTrackingStore } from '@/features/tracking/store';
import { useTranslation } from '@/i18n/useTranslation';
import { formatLocationTimestamp } from '@/lib/location-tracking';
import { colors, radius, shadows, spacing, typography } from '@/theme';

type LocationTrackingCardProps = {
  manageWatcher?: boolean;
  compact?: boolean;
};

export function LocationTrackingCard({ manageWatcher = false, compact = false }: LocationTrackingCardProps) {
  const { t } = useTranslation();
  const initialize = locationTrackingStore((state) => state.initialize);
  const refreshStatus = locationTrackingStore((state) => state.refreshStatus);
  const grantConsent = locationTrackingStore((state) => state.grantConsent);
  const endSharing = locationTrackingStore((state) => state.endSharing);
  const stopWatcher = locationTrackingStore((state) => state.stopWatcher);
  const syncWatcherFromStatus = locationTrackingStore((state) => state.syncWatcherFromStatus);
  const status = locationTrackingStore((state) => state.status);
  const loading = locationTrackingStore((state) => state.loading);
  const busy = locationTrackingStore((state) => state.busy);
  const lastLocalUploadAt = locationTrackingStore((state) => state.lastLocalUploadAt);
  const permissionDenied = locationTrackingStore((state) => state.permissionDenied);
  const uploadError = locationTrackingStore((state) => state.uploadError);
  const watcherActive = locationTrackingStore((state) => state.watcherActive);

  useEffect(() => {
    initialize();
    void (async () => {
      const nextStatus = await refreshStatus();
      if (manageWatcher) {
        await syncWatcherFromStatus(nextStatus);
      }
    })();
    return () => {
      if (manageWatcher) void stopWatcher();
    };
  }, [initialize, manageWatcher, refreshStatus, stopWatcher, syncWatcherFromStatus]);

  if (Platform.OS === 'web') return null;

  const needsConsent = !status?.consentGranted || permissionDenied;
  const sharingActive = Boolean(status?.sharingActive && status.trackingAllowed);
  const trackingActive = sharingActive && watcherActive;
  const lastUploadLabel = formatLocationTimestamp(lastLocalUploadAt ?? status?.lastUpload?.receivedAt);

  const statusColor = trackingActive
    ? colors.success
    : permissionDenied
      ? colors.danger
      : sharingActive
        ? colors.warning
        : colors.muted;

  const statusText = trackingActive
    ? t('location.active')
    : sharingActive
      ? t('location.sharingWaitingGps')
      : permissionDenied
        ? t('location.permissionDenied')
        : needsConsent
          ? t('location.consentNeeded')
          : t('location.sharingStoppedCheckin');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Feather name="navigation" size={18} color={colors.accent} />
        <Text style={styles.title}>
          {compact ? t('location.compactTitle') : t('location.title')}
        </Text>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
      </View>
      {loading && !status ? <LoadingState label={t('common.loading')} /> : null}
      {!loading || status ? (
        <>
          {!compact ? <Text style={styles.hint}>{t('location.checkinHint')}</Text> : null}
          <Text style={styles.status}>{statusText}</Text>
          <Text style={styles.meta}>
            {t('location.lastUpload')}: {lastUploadLabel ?? t('location.never')}
          </Text>
          {status && !status.hasTrackableAssignmentToday && status.consentGranted ? (
            <Text style={styles.warn}>{t('location.noAssignmentToday')}</Text>
          ) : null}
          {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}
          {needsConsent ? (
            <ActionButton
              label={busy ? t('common.loading') : t('location.grantConsent')}
              onPress={() => {
                void grantConsent();
              }}
              disabled={busy}
              variant="secondary"
            />
          ) : null}
          {sharingActive ? (
            <ActionButton
              label={busy ? t('common.loading') : t('location.endJourney')}
              onPress={() => {
                void endSharing();
              }}
              disabled={busy}
              variant="danger"
            />
          ) : null}
        </>
      ) : null}
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
  hint: {
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  status: { ...typography.bodyMedium, color: colors.primary },
  meta: { ...typography.caption, textTransform: 'none' },
  warn: { color: colors.warning, fontSize: 12 },
  error: { color: colors.danger, fontSize: 12 },
});
