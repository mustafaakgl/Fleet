import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { driverApi } from '@/api/endpoints';
import { useTranslation } from '@/i18n/useTranslation';
import { getErrorMessage } from '@/utils/errors';
import { colors, radius, spacing } from '@/theme';

export default function LicenseHistoryScreen() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['license-check-history'],
    queryFn: () => driverApi.licenseCheckHistory(),
  });

  if (isLoading) return <LoadingState label={t('licenseCheck.loading')} />;
  if (error) {
    return (
      <ErrorState
        message={getErrorMessage(error, t('licenseCheck.loadError'))}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const rows = data ?? [];

  return (
    <ScreenLayout title={t('licenseCheck.historyTitle')} subtitle={t('licenseCheck.historySubtitle')}>
      {rows.length === 0 ? (
        <Text style={styles.empty}>{t('licenseCheck.historyEmpty')}</Text>
      ) : (
        rows.map((row) => (
          <View key={row.id} style={styles.card}>
            <Text style={styles.date}>{row.check_date}</Text>
            <Text style={styles.type}>{row.check_type}</Text>
            <Text style={[styles.status, statusStyle(row.status)]}>{row.status}</Text>
            {row.rejection_reason ? (
              <Text style={styles.reason}>{row.rejection_reason}</Text>
            ) : null}
          </View>
        ))
      )}
    </ScreenLayout>
  );
}

function statusStyle(status: string) {
  if (status === 'approved') return { color: colors.success };
  if (status === 'rejected') return { color: colors.danger };
  return { color: colors.warning };
}

const styles = StyleSheet.create({
  empty: {
    color: colors.muted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 4,
  },
  date: {
    fontWeight: '700',
    color: colors.text,
  },
  type: {
    color: colors.muted,
    fontSize: 13,
  },
  status: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  reason: {
    fontSize: 12,
    color: colors.danger,
  },
});
