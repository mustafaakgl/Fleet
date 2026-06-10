import { Feather } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { AuthenticatedImage } from '@/components/AuthenticatedImage';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { driverApi } from '@/api/endpoints';
import { driverFineDocumentPath, openAuthenticatedFineDocument } from '@/lib/authenticated-files';
import { useTranslation } from '@/i18n/useTranslation';
import { formatAppCurrency, formatAppDate } from '@/i18n/format';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { colors, radius, spacing, typography } from '@/theme';
import { Card } from '@/components/ui/Card';

export default function DriverFineDetailScreen() {
  const { t, locale } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: fine, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-fine', id],
    queryFn: () => driverApi.getFine(id),
    enabled: Boolean(id),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: () =>
      driverApi.acknowledgeFine(id, {
        acknowledged_at: new Date().toISOString(),
        platform: Platform.OS,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['driver-fines'] });
      await queryClient.invalidateQueries({ queryKey: ['driver-fine', id] });
      showSuccess(t('fines.ackSuccess'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('fines.ackFailed')));
    },
  });

  const openDocument = async () => {
    try {
      await openAuthenticatedFineDocument(id);
    } catch (documentError) {
      showError(getErrorMessage(documentError, t('fines.documentFailed')));
    }
  };

  if (isLoading) {
    return <LoadingState label={t('common.loading')} />;
  }

  if (error || !fine) {
    return (
      <ErrorState
        message={getErrorMessage(error, t('fines.loadError'))}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const hasDocument = Boolean(fine.document_url);

  return (
    <>
      <Stack.Screen options={{ title: t('fines.detailTitle') }} />
      <ScreenLayout title={fine.vehicle.plate_number} subtitle={fine.violation_type}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {fine.pending_ack ? (
            <View style={styles.alertCard}>
              <Feather name="alert-circle" size={20} color={colors.warning} />
              <Text style={styles.alertText}>{t('fines.ackRequired')}</Text>
            </View>
          ) : null}

          <Card>
            <Info label={t('fines.fieldDate')} value={formatAppDate(locale, new Date(fine.violation_at))} />
            <Info label={t('fines.fieldLocation')} value={fine.violation_location} />
            <Info
              label={t('fines.fieldCategory')}
              value={t(`fines.category.${fine.violation_category}`)}
            />
            <Info label={t('fines.fieldAmount')} value={formatAppCurrency(locale, fine.amount)} />
            {fine.payment_due_date ? (
              <Info
                label={t('fines.fieldPaymentDue')}
                value={
                  fine.days_until_due != null
                    ? `${formatAppDate(locale, new Date(fine.payment_due_date))} (${t('fines.dueInDays', { days: fine.days_until_due })})`
                    : formatAppDate(locale, new Date(fine.payment_due_date))
                }
              />
            ) : null}
            <Info
              label={t('fines.fieldStatus')}
              value={t(`fines.status.${fine.status}`)}
            />
            {fine.notes ? <Info label={t('fines.fieldNotes')} value={fine.notes} /> : null}
          </Card>

          {hasDocument ? (
            <View style={styles.documentSection}>
              <Text style={styles.sectionTitle}>{t('fines.documentTitle')}</Text>
              <AuthenticatedImage
                apiPath={driverFineDocumentPath(fine.id)}
                style={styles.documentPreview}
                resizeMode="contain"
              />
              <ActionButton
                label={t('fines.openDocument')}
                onPress={() => {
                  void openDocument();
                }}
                variant="secondary"
              />
            </View>
          ) : null}

          {fine.pending_ack ? (
            <ActionButton
              label={
                acknowledgeMutation.isPending ? t('fines.acknowledging') : t('fines.acknowledge')
              }
              onPress={() => acknowledgeMutation.mutate()}
              disabled={acknowledgeMutation.isPending}
              variant="primary"
            />
          ) : fine.driver_acknowledged_at ? (
            <View style={styles.ackDone}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={styles.ackDoneText}>
                {t('fines.ackDone', { date: formatAppDate(locale, new Date(fine.driver_acknowledged_at)) })}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </ScreenLayout>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.warning,
    padding: spacing.md,
  },
  alertText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  infoRow: {
    gap: 2,
    paddingVertical: spacing.xs,
  },
  infoLabel: {
    ...typography.caption,
    textTransform: 'none',
  },
  infoValue: {
    ...typography.bodyMedium,
    color: colors.primary,
  },
  documentSection: {
    gap: spacing.sm,
  },
  sectionTitle: {
    ...typography.h2,
    fontSize: 16,
  },
  documentPreview: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ackDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.successSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  ackDoneText: {
    color: colors.success,
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
  },
});
