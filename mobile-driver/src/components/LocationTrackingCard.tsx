import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { locationTrackingStore } from '@/features/tracking/store';
import { useTranslation } from '@/i18n/useTranslation';
import { formatLocationTimestamp, syncForegroundLocationWatcher } from '@/lib/location-tracking';
import { colors, radius, shadows, spacing, typography } from '@/theme';

type LocationTrackingCardProps = {
  manageWatcher?: boolean;
  compact?: boolean;
};

export function LocationTrackingCard({ manageWatcher = false, compact = false }: LocationTrackingCardProps) {
  const { t } = useTranslation();
  const initialize = locationTrackingStore((state) => state.initialize);
  const refreshStatus = locationTrackingStore((state) => state.refreshStatus);
  const enableTracking = locationTrackingStore((state) => state.enableTracking);
  const stopTracking = locationTrackingStore((state) => state.stopTracking);
  const status = locationTrackingStore((state) => state.status);
  const loading = locationTrackingStore((state) => state.loading);
  const enabling = locationTrackingStore((state) => state.enabling);
  const lastLocalUploadAt = locationTrackingStore((state) => state.lastLocalUploadAt);
  const permissionDenied = locationTrackingStore((state) => state.permissionDenied);
  const uploadError = locationTrackingStore((state) => state.uploadError);
  const watcherActive = locationTrackingStore((state) => state.watcherActive);

  useEffect(() => {
    initialize();
    void (async () => {
      const nextStatus = await refreshStatus();
      if (manageWatcher && nextStatus?.trackingAllowed) {
        await syncForegroundLocationWatcher(true);
      }
    })();
    return () => {
      if (manageWatcher) void stopTracking();
    };
  }, [initialize, manageWatcher, refreshStatus, stopTracking]);

  if (Platform.OS === 'web') return null;

  const showEnableButton = !status?.consentGranted || permissionDenied;
  const trackingActive = Boolean(status?.trackingAllowed && watcherActive);
  const lastUploadLabel = formatLocationTimestamp(lastLocalUploadAt ?? status?.lastUpload?.receivedAt);

  const statusColor = trackingActive
    ? colors.success
    : permissionDenied
      ? colors.danger
      : colors.warning;

  const statusText = trackingActive
    ? t('location.active')
    : permissionDenied
      ? t('location.permissionDenied')
      : showEnableButton
        ? t('location.enable')
        : status?.trackingAllowed
          ? t('location.readyOnHome')
          : t('location.unavailable');

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
          {!compact ? (
            <Text style={styles.row}>
              {t('location.consent')}: {status?.consentGranted ? t('location.granted') : t('location.notGranted')}
            </Text>
          ) : null}
          <Text style={styles.status}>{statusText}</Text>
          <Text style={styles.meta}>
            {t('location.lastUpload')}: {lastUploadLabel ?? t('location.never')}
          </Text>
          {uploadError ? <Text style={styles.error}>{uploadError}</Text> : null}
          {showEnableButton ? (
            <ActionButton
              label={enabling ? t('common.loading') : t('location.enable')}
              onPress={() => {
                void (async () => {
                  const result = await enableTracking();
                  if (manageWatcher && result === 'enabled') {
                    await syncForegroundLocationWatcher(true);
                  }
                })();
              }}
              disabled={enabling}
              variant="primary"
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
  row: { color: colors.subtext, fontSize: 13 },
  status: { ...typography.bodyMedium, color: colors.primary },
  meta: { ...typography.caption, textTransform: 'none' },
  error: { color: colors.danger, fontSize: 12 },
});
