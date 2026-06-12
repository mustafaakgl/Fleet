import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi, fleetVehicleApi } from '@/api/endpoints';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

function statusLabel(
  status: 'ok' | 'due_soon' | 'overdue' | 'unknown',
  t: (key: string) => string,
) {
  switch (status) {
    case 'due_soon':
      return t('fleetVehicle.statusDueSoon');
    case 'overdue':
      return t('fleetVehicle.statusOverdue');
    case 'ok':
      return t('fleetVehicle.statusOk');
    default:
      return t('fleetVehicle.statusUnknown');
  }
}

function statusColor(status: 'ok' | 'due_soon' | 'overdue' | 'unknown') {
  switch (status) {
    case 'overdue':
      return colors.danger;
    case 'due_soon':
      return colors.warning;
    case 'ok':
      return colors.success;
    default:
      return colors.subtext;
  }
}

export default function FleetVehicleStatusScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
  });

  const vehicle =
    me?.driver.assignedVehicle ?? me?.driver.todayAssignment?.vehicle ?? null;
  const vehicleId = vehicle?.id ?? '';

  const { data: status, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['fleet-vehicle-status', vehicleId],
    queryFn: () => fleetVehicleApi.getStatus(vehicleId),
    enabled: Platform.OS !== 'web' && Boolean(vehicleId),
  });

  const [odometerInput, setOdometerInput] = useState('');

  const correctionMutation = useMutation({
    mutationFn: () => {
      const parsed = Number(odometerInput.replace(',', '.'));
      if (!vehicleId || !Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Invalid odometer');
      }
      return fleetVehicleApi.correctOdometer(vehicleId, parsed);
    },
    onSuccess: async () => {
      showSuccess(t('fleetVehicle.correctionSuccess'));
      setOdometerInput('');
      await queryClient.invalidateQueries({ queryKey: ['fleet-vehicle-status', vehicleId] });
    },
    onError: (error) => {
      showError(getErrorMessage(error, t('fleetVehicle.correctionFailed')));
    },
  });

  if (Platform.OS === 'web') {
    return (
      <ScreenLayout title={t('fleetVehicle.title')} subtitle={t('fleetVehicle.subtitle')}>
        <Text style={styles.hint}>{t('fleetVehicle.webOnlyNative')}</Text>
      </ScreenLayout>
    );
  }

  if (meLoading || isLoading) {
    return (
      <ScreenLayout title={t('fleetVehicle.title')} subtitle={t('fleetVehicle.subtitle')}>
        <LoadingState label={t('common.loading')} />
      </ScreenLayout>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('fleetVehicle.title') }} />
      <ScreenLayout
        title={t('fleetVehicle.title')}
        subtitle={vehicle?.plateNumber ?? t('fleetVehicle.subtitle')}
        onRefresh={() => void refetch()}
        refreshing={isRefetching}
      >
        {!vehicleId ? (
          <Text style={styles.hint}>{t('fleetVehicle.noVehicleHint')}</Text>
        ) : (
          <View style={styles.content}>
            <View style={styles.statsCard}>
              <Text style={styles.statsTitle}>{t('fleetVehicle.currentOdometer')}</Text>
              <Text style={styles.statsValue}>
                {status ? `${status.currentOdometerKm.toFixed(0)} km` : '—'}
              </Text>
              {status ? (
                <Text style={styles.statsMeta}>
                  {t('fleetVehicle.gpsAccumulated', { km: status.gpsAccumulatedKm.toFixed(0) })}
                </Text>
              ) : null}
            </View>

            <View style={styles.form}>
              <Text style={styles.sectionTitle}>{t('fleetVehicle.correctionTitle')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('fleetVehicle.correctionPlaceholder')}
                keyboardType="decimal-pad"
                value={odometerInput}
                onChangeText={setOdometerInput}
              />
              <ActionButton
                label={
                  correctionMutation.isPending
                    ? t('common.loading')
                    : t('fleetVehicle.saveCorrection')
                }
                onPress={() => {
                  Alert.alert(
                    t('fleetVehicle.correctionConfirmTitle'),
                    t('fleetVehicle.correctionConfirmMessage'),
                    [
                      { text: t('common.cancel'), style: 'cancel' },
                      { text: t('common.save'), onPress: () => correctionMutation.mutate() },
                    ],
                  );
                }}
                disabled={correctionMutation.isPending || !odometerInput.trim()}
                variant="primary"
              />
            </View>

            <View style={styles.history}>
              <Text style={styles.sectionTitle}>{t('fleetVehicle.maintenanceTitle')}</Text>
              {!status?.maintenanceRules.length ? (
                <Text style={styles.hint}>{t('fleetVehicle.noMaintenanceRules')}</Text>
              ) : (
                status.maintenanceRules.map((rule) => (
                  <View key={rule.id} style={styles.ruleRow}>
                    <View style={styles.ruleMain}>
                      <Text style={styles.ruleName}>{rule.name}</Text>
                      <Text style={styles.ruleMeta}>
                        {rule.remainingKm != null
                          ? t('fleetVehicle.remainingKm', {
                              km: Math.max(0, Math.round(rule.remainingKm)),
                            })
                          : null}
                        {rule.remainingKm != null && rule.remainingDays != null ? ' · ' : null}
                        {rule.remainingDays != null
                          ? t('fleetVehicle.remainingDays', { days: rule.remainingDays })
                          : null}
                      </Text>
                    </View>
                    <Text style={[styles.ruleStatus, { color: statusColor(rule.status) }]}>
                      {statusLabel(rule.status, t)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </View>
        )}
      </ScreenLayout>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  hint: {
    color: colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  statsCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  statsTitle: {
    ...typography.caption,
    textTransform: 'uppercase',
  },
  statsValue: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.primary,
  },
  statsMeta: {
    ...typography.bodyMedium,
    color: colors.subtext,
  },
  form: {
    gap: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    color: colors.text,
  },
  history: {
    gap: spacing.sm,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ruleMain: {
    flex: 1,
    gap: 2,
  },
  ruleName: {
    ...typography.bodyMedium,
  },
  ruleMeta: {
    color: colors.subtext,
    fontSize: 13,
  },
  ruleStatus: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
