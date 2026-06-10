import { Feather } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { useTranslation } from '@/i18n/useTranslation';
import { formatAppCurrency, formatAppDate } from '@/i18n/format';
import type { AppLocale } from '@/i18n/languages';
import { getErrorMessage } from '@/utils/errors';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import type { DriverFine } from '@/api/types';

export default function DriverFinesListScreen() {
  const { t, locale } = useTranslation();
  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['driver-fines'],
    queryFn: () => driverApi.listFines(),
  });

  const fines = data ?? [];
  const pendingCount = fines.filter((fine) => fine.pending_ack).length;

  return (
    <>
      <Stack.Screen options={{ title: t('fines.title') }} />
      <ScreenLayout
        title={t('fines.title')}
        subtitle={t('fines.subtitle')}
        refreshing={isRefetching}
        onRefresh={() => {
          void refetch();
        }}
      >
        {pendingCount > 0 ? (
          <View style={styles.alertCard}>
            <Feather name="alert-circle" size={18} color={colors.warning} />
            <Text style={styles.alertText}>
              {t('fines.pendingBanner', { count: pendingCount })}
            </Text>
          </View>
        ) : null}

        {isLoading ? <LoadingState label={t('common.loading')} /> : null}
        {!isLoading && error ? (
          <ErrorState
            message={getErrorMessage(error, t('fines.loadError'))}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : null}
        {!isLoading && !error && fines.length === 0 ? (
          <EmptyState
            title={t('fines.emptyTitle')}
            message={t('fines.emptyHint')}
            icon="file-text"
          />
        ) : null}
        {!isLoading && !error && fines.length > 0 ? (
          <View style={styles.list}>
            {fines.map((fine) => (
              <FineRow
                key={fine.id}
                fine={fine}
                locale={locale}
                onPress={() => router.push(`/(app)/today/fine/${fine.id}`)}
                statusLabel={t(`fines.status.${fine.status}`)}
              />
            ))}
          </View>
        ) : null}
      </ScreenLayout>
    </>
  );
}

function FineRow({
  fine,
  locale,
  onPress,
  statusLabel,
}: {
  fine: DriverFine;
  locale: AppLocale;
  onPress: () => void;
  statusLabel: string;
}) {
  const { t } = useTranslation();

  return (
    <Pressable style={[styles.row, fine.pending_ack && styles.rowPending]} onPress={onPress}>
      <View style={styles.rowTop}>
        <Text style={styles.plate}>{fine.vehicle.plate_number}</Text>
        {fine.pending_ack ? (
          <View style={styles.pendingPill}>
            <Text style={styles.pendingPillText}>{t('fines.pendingAck')}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.violation}>{fine.violation_type}</Text>
      <Text style={styles.meta}>
        {formatAppDate(locale, new Date(fine.violation_at))} · {fine.violation_location}
      </Text>
      <View style={styles.rowBottom}>
        <Text style={styles.amount}>{formatAppCurrency(locale, fine.amount)}</Text>
        <Text style={styles.status}>{statusLabel}</Text>
      </View>
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
  alertText: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.sm,
  },
  rowPending: {
    borderLeftWidth: 4,
    borderLeftColor: colors.warning,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  plate: {
    ...typography.h2,
    fontSize: 17,
  },
  pendingPill: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingPillText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
  },
  violation: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  meta: {
    color: colors.muted,
    fontSize: 12,
  },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  amount: {
    fontWeight: '700',
    color: colors.text,
  },
  status: {
    color: colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
});
