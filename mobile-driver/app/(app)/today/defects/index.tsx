import { Feather } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { driverApi } from '@/api/endpoints';
import type { DriverDefect } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { formatAppDate } from '@/i18n/format';
import { getErrorMessage } from '@/utils/errors';
import { colors, radius, shadows, spacing, typography } from '@/theme';

export default function DriverDefectsListScreen() {
  const { t, locale } = useTranslation();
  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['driver-defects'],
    queryFn: () => driverApi.listDefects(),
  });

  const defects = data ?? [];
  const pendingCount = defects.filter((row) => row.pending_confirmation).length;

  return (
    <>
      <Stack.Screen options={{ title: t('defects.title') }} />
      <ScreenLayout
        title={t('defects.title')}
        subtitle={t('defects.subtitle')}
        refreshing={isRefetching}
        onRefresh={() => {
          void refetch();
        }}
      >
        {pendingCount > 0 ? (
          <View style={styles.alertCard}>
            <Feather name="alert-circle" size={18} color={colors.warning} />
            <Text style={styles.alertText}>{t('defects.pendingBanner', { count: pendingCount })}</Text>
          </View>
        ) : null}

        <ActionButton
          label={t('defects.report')}
          onPress={() => router.push('/(app)/today/defect-report')}
        />

        {isLoading ? <LoadingState label={t('common.loading')} /> : null}
        {!isLoading && error ? (
          <ErrorState
            message={getErrorMessage(error, t('defects.loadError'))}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : null}
        {!isLoading && !error && defects.length === 0 ? (
          <EmptyState title={t('defects.emptyTitle')} message={t('defects.emptyHint')} icon="tool" />
        ) : null}
        {!isLoading && !error && defects.length > 0 ? (
          <View style={styles.list}>
            {defects.map((defect) => (
              <DefectRow
                key={defect.id}
                defect={defect}
                locale={locale}
                onPress={() => router.push(`/(app)/today/defect/${defect.id}`)}
                statusLabel={t(`defects.status.${defect.status}`)}
                severityLabel={t(`defects.severity.${defect.severity}`)}
              />
            ))}
          </View>
        ) : null}
      </ScreenLayout>
    </>
  );
}

function DefectRow({
  defect,
  locale,
  onPress,
  statusLabel,
  severityLabel,
}: {
  defect: DriverDefect;
  locale: Parameters<typeof formatAppDate>[0];
  onPress: () => void;
  statusLabel: string;
  severityLabel: string;
}) {
  const { t } = useTranslation();
  return (
    <Pressable style={[styles.row, defect.pending_confirmation && styles.rowPending]} onPress={onPress}>
      <View style={styles.rowTop}>
        <Text style={styles.plate}>{defect.vehicle.plate_number}</Text>
        {defect.pending_confirmation ? (
          <Text style={styles.pendingPill}>{t('defects.pendingConfirm')}</Text>
        ) : null}
      </View>
      <Text style={styles.title}>{defect.title}</Text>
      <Text style={styles.meta}>
        {formatAppDate(locale, new Date(defect.created_at))} · {severityLabel} · {statusLabel}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  alertText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  list: { gap: spacing.sm, marginTop: spacing.sm },
  row: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.sm,
  },
  rowPending: { borderLeftWidth: 4, borderLeftColor: colors.warning },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  plate: { ...typography.h2, fontSize: 17 },
  pendingPill: { color: colors.warning, fontSize: 11, fontWeight: '700' },
  title: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  meta: { color: colors.muted, fontSize: 12 },
});
