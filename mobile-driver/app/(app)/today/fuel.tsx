import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ActionButton } from '@/components/ActionButton';
import { LoadingState } from '@/components/LoadingState';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi, fleetFuelApi } from '@/api/endpoints';
import { formatAppDate } from '@/i18n/format';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

type PickedReceipt = { uri: string; name: string; type: string };

export default function FleetFuelScreen() {
  const { t, locale } = useTranslation();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
  });

  const vehicle =
    me?.driver.assignedVehicle ?? me?.driver.todayAssignment?.vehicle ?? null;
  const vehicleId = vehicle?.id ?? '';
  const vehiclePlate = vehicle?.plateNumber ?? '';

  const [liters, setLiters] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [isFullTank, setIsFullTank] = useState(false);
  const [receipt, setReceipt] = useState<PickedReceipt | null>(null);

  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['fleet-fuel-analytics', vehicleId],
    queryFn: () => fleetFuelApi.getAnalytics(vehicleId),
    enabled: Platform.OS !== 'web' && Boolean(vehicleId),
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const parsedLiters = Number(liters.replace(',', '.'));
      const parsedCost = Number(totalCost.replace(',', '.'));
      const parsedOdometer = odometerKm.trim()
        ? Number(odometerKm.replace(',', '.'))
        : undefined;

      if (!vehicleId) throw new Error('No vehicle');
      if (!Number.isFinite(parsedLiters) || parsedLiters <= 0) {
        throw new Error('Invalid liters');
      }
      if (!Number.isFinite(parsedCost) || parsedCost < 0) {
        throw new Error('Invalid cost');
      }

      return fleetFuelApi.create({
        vehicleId,
        liters: parsedLiters,
        totalCost: parsedCost,
        odometerKm: parsedOdometer,
        isFullTank,
        receipt: receipt ?? undefined,
      });
    },
    onSuccess: async () => {
      showSuccess(t('fleetFuel.saveSuccess'));
      setLiters('');
      setTotalCost('');
      setOdometerKm('');
      setIsFullTank(false);
      setReceipt(null);
      await queryClient.invalidateQueries({ queryKey: ['fleet-fuel-analytics', vehicleId] });
      await queryClient.invalidateQueries({ queryKey: ['fleet-fuel-entries', vehicleId] });
    },
    onError: (error) => {
      showError(getErrorMessage(error, t('fleetFuel.saveFailed')));
    },
  });

  async function pickReceipt(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showError(t('fleetFuel.receiptDenied'));
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.85 });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setReceipt({
      uri: asset.uri,
      name: asset.fileName ?? `fuel-receipt-${Date.now()}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
  }

  if (Platform.OS === 'web') {
    return (
      <ScreenLayout title={t('fleetFuel.title')} subtitle={t('fleetFuel.subtitle')}>
        <Text style={styles.hint}>{t('fleetFuel.webOnlyNative')}</Text>
      </ScreenLayout>
    );
  }

  if (meLoading) {
    return (
      <ScreenLayout title={t('fleetFuel.title')} subtitle={t('fleetFuel.subtitle')}>
        <LoadingState label={t('common.loading')} />
      </ScreenLayout>
    );
  }

  const latestInterval = analytics?.intervals.at(-1) ?? null;

  return (
    <>
      <Stack.Screen options={{ title: t('fleetFuel.title') }} />
      <ScreenLayout
        title={t('fleetFuel.title')}
        subtitle={vehiclePlate || t('fleetFuel.subtitle')}
        onRefresh={() => {
          void queryClient.invalidateQueries({ queryKey: ['fleet-fuel-analytics', vehicleId] });
        }}
        refreshing={analyticsLoading}
      >
        {!vehicleId ? (
          <Text style={styles.hint}>{t('fleetFuel.noVehicleHint')}</Text>
        ) : (
          <View style={styles.content}>
            {analytics?.avgLitersPer100Km != null ? (
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>{t('fleetFuel.avgConsumption')}</Text>
                <Text style={styles.statsValue}>
                  {analytics.avgLitersPer100Km.toFixed(1)} {t('fleetFuel.litersPer100Km')}
                </Text>
                <Text style={styles.statsMeta}>{t('fleetFuel.realConsumptionHint')}</Text>
                {latestInterval ? (
                  <Text style={styles.statsMeta}>
                    {t('fleetFuel.latestInterval', {
                      liters: latestInterval.litersPer100Km.toFixed(1),
                      km: latestInterval.distanceKm.toFixed(0),
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {analytics?.avgEstimatedLitersPer100Km != null ? (
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>{t('fleetFuel.estimatedConsumption')}</Text>
                <Text style={styles.statsValue}>
                  {analytics.avgEstimatedLitersPer100Km.toFixed(1)} {t('fleetFuel.litersPer100Km')}
                </Text>
                <Text style={styles.statsMeta}>
                  {t('fleetFuel.estimatedLitersTotal', {
                    liters: analytics.totalEstimatedLiters.toFixed(1),
                    km: analytics.tripDistanceKm.toFixed(0),
                  })}
                </Text>
                {analytics.estimatedVsRealDeltaLiters != null ? (
                  <Text style={styles.statsMeta}>
                    {t('fleetFuel.deltaVsReal', {
                      delta: analytics.estimatedVsRealDeltaLiters.toFixed(1),
                    })}
                  </Text>
                ) : null}
              </View>
            ) : null}

            {analytics?.weeklyTrend?.length ? (
              <View style={styles.history}>
                <Text style={styles.historyTitle}>{t('fleetFuel.weeklyTrend')}</Text>
                {analytics.weeklyTrend.slice(-6).map((week) => (
                  <View key={week.weekStart} style={styles.historyRow}>
                    <View style={styles.historyMain}>
                      <Text style={styles.historyDate}>{week.weekStart}</Text>
                      <Text style={styles.historyMeta}>
                        {t('fleetFuel.weekRealVsEstimated', {
                          real: week.realLitersPer100Km?.toFixed(1) ?? '—',
                          estimated: week.estimatedLitersPer100Km?.toFixed(1) ?? '—',
                        })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.form}>
              <TextInput
                style={styles.input}
                placeholder={t('fleetFuel.fieldLiters')}
                keyboardType="decimal-pad"
                value={liters}
                onChangeText={setLiters}
              />
              <TextInput
                style={styles.input}
                placeholder={t('fleetFuel.fieldCost')}
                keyboardType="decimal-pad"
                value={totalCost}
                onChangeText={setTotalCost}
              />
              <TextInput
                style={styles.input}
                placeholder={t('fleetFuel.fieldOdometer')}
                keyboardType="decimal-pad"
                value={odometerKm}
                onChangeText={setOdometerKm}
              />
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{t('fleetFuel.fieldFullTank')}</Text>
                <Switch value={isFullTank} onValueChange={setIsFullTank} />
              </View>
              <View style={styles.receiptRow}>
                <ActionButton
                  label={t('fleetFuel.addReceiptCamera')}
                  onPress={() => void pickReceipt(true)}
                  variant="secondary"
                />
                <ActionButton
                  label={t('fleetFuel.addReceiptGallery')}
                  onPress={() => void pickReceipt(false)}
                  variant="secondary"
                />
              </View>
              {receipt ? (
                <Image source={{ uri: receipt.uri }} style={styles.receiptPreview} />
              ) : null}
              <ActionButton
                label={createMutation.isPending ? t('common.loading') : t('fleetFuel.saveEntry')}
                onPress={() => createMutation.mutate()}
                disabled={createMutation.isPending || !liters.trim() || !totalCost.trim()}
                variant="primary"
              />
            </View>

            {analytics?.entries?.length ? (
              <View style={styles.history}>
                <Text style={styles.historyTitle}>{t('fleetFuel.recentEntries')}</Text>
                {analytics.entries.slice(0, 8).map((entry) => (
                  <View key={entry.id} style={styles.historyRow}>
                    <View style={styles.historyMain}>
                      <Text style={styles.historyDate}>
                        {formatAppDate(entry.enteredAt, locale)}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {entry.liters.toFixed(1)} L · {entry.totalCost.toFixed(2)} {entry.currency}
                        {entry.isFullTank ? ` · ${t('fleetFuel.fullTankBadge')}` : ''}
                      </Text>
                    </View>
                    {entry.hasReceipt ? (
                      <Feather name="paperclip" size={16} color={colors.muted} />
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
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
    fontSize: 32,
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
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.card,
    color: colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  switchLabel: {
    ...typography.bodyMedium,
    flex: 1,
    paddingRight: spacing.md,
  },
  receiptRow: {
    gap: spacing.sm,
  },
  receiptPreview: {
    width: '100%',
    height: 180,
    borderRadius: radius.md,
    backgroundColor: colors.border,
  },
  history: {
    gap: spacing.sm,
  },
  historyTitle: {
    ...typography.h3,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyMain: {
    flex: 1,
    gap: 2,
  },
  historyDate: {
    ...typography.bodyMedium,
  },
  historyMeta: {
    color: colors.subtext,
    fontSize: 13,
  },
});
