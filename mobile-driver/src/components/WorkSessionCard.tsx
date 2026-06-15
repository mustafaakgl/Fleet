import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { driverApi } from '@/api/endpoints';
import { ActionButton } from '@/components/ActionButton';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/SectionHeader';
import { useTranslation } from '@/i18n/useTranslation';
import {
  clearFeierabendPause,
  isFeierabendPausedToday,
  markFeierabendToday,
} from '@/lib/work-session-feierabend';
import { colors, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

function formatStartedAt(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    }).format(new Date(value));
  } catch {
    return value.slice(0, 16).replace('T', ' ');
  }
}

export function WorkSessionCard() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [feierabendToday, setFeierabendToday] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [current, paused] = await Promise.all([
        driverApi.getCurrentWorkSession(),
        isFeierabendPausedToday(),
      ]);
      setActive(current.active);
      setStartedAt(current.session?.startedAt ?? null);
      setFeierabendToday(paused);
    } catch {
      showError(t('profile.workSessionLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleEndShift() {
    setBusy(true);
    try {
      await driverApi.endWorkSession('manual');
      await markFeierabendToday();
      setActive(false);
      setStartedAt(null);
      setFeierabendToday(true);
      showSuccess(t('profile.workSessionEnded'));
    } catch (error) {
      showError(getErrorMessage(error, t('profile.workSessionEndFailed')));
    } finally {
      setBusy(false);
    }
  }

  async function handleStartShift() {
    setBusy(true);
    try {
      await clearFeierabendPause();
      const session = await driverApi.startWorkSession();
      setActive(true);
      setStartedAt(session.startedAt);
      setFeierabendToday(false);
      showSuccess(t('profile.workSessionStarted'));
    } catch (error) {
      showError(getErrorMessage(error, t('profile.workSessionStartFailed')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionHeader title={t('profile.workSessionTitle')} />
      <Text style={styles.hint}>{t('profile.workSessionHint')}</Text>
      <Card>
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.statusText}>{t('common.loading')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.statusText}>
              {active
                ? t('profile.workSessionActive', {
                    time: startedAt ? formatStartedAt(startedAt) : '—',
                  })
                : feierabendToday
                  ? t('profile.workSessionEndedToday')
                  : t('profile.workSessionInactive')}
            </Text>
            {active ? (
              <ActionButton
                label={t('profile.endWorkSession')}
                onPress={() => void handleEndShift()}
                variant="danger"
                disabled={busy}
              />
            ) : (
              <ActionButton
                label={
                  feierabendToday ? t('profile.restartWorkSession') : t('profile.startWorkSession')
                }
                onPress={() => void handleStartShift()}
                disabled={busy}
              />
            )}
          </>
        )}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  hint: {
    ...typography.caption,
    textTransform: 'none',
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusText: {
    ...typography.bodyMedium,
    color: colors.primary,
    marginBottom: spacing.sm,
  },
});
