import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { ActionButton } from '@/components/ActionButton';
import { driverApi } from '@/api/endpoints';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { useTranslation } from '@/i18n/useTranslation';
import { localTodayDate } from '@/lib/calendar-date';
import { LoadingState } from '@/components/LoadingState';

export default function MorningCheckinScreen() {
  const { t } = useTranslation();
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [cargoName, setCargoName] = useState('');
  const [cargoQuantity, setCargoQuantity] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const { data: existingCheckins, isLoading: loadingExisting } = useQuery({
    queryKey: ['morning-checkins', localTodayDate()],
    queryFn: () => driverApi.listMorningCheckins(localTodayDate()),
  });
  const hasCheckinToday = (existingCheckins?.length ?? 0) > 0;

  const createMutation = useMutation({
    mutationFn: () =>
      driverApi.createMorningCheckin({
        date: localTodayDate(),
        vehiclePlate: vehiclePlate.trim(),
        companyName: companyName.trim(),
        cargoName: cargoName.trim(),
        cargoQuantity: cargoQuantity.trim(),
      }),
    onSuccess: () => {
      setVehiclePlate('');
      setCompanyName('');
      setCargoName('');
      setCargoQuantity('');
      showSuccess(t('morningCheckin.success'));
      router.back();
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('morningCheckin.submitFailed')));
    },
  });

  const onSubmit = () => {
    if (
      !vehiclePlate.trim() ||
      !companyName.trim() ||
      !cargoName.trim() ||
      !cargoQuantity.trim()
    ) {
      setValidationError(t('morningCheckin.validationRequired'));
      return;
    }
    setValidationError(null);
    createMutation.mutate();
  };

  if (loadingExisting) {
    return (
      <ScreenLayout title={t('morningCheckin.title')} subtitle={t('morningCheckin.subtitle')}>
        <LoadingState label={t('common.loading')} />
      </ScreenLayout>
    );
  }

  if (hasCheckinToday) {
    const latest = existingCheckins?.[0];
    const statusKey =
      latest?.status === 'added_to_einsatzplan'
        ? 'morningCheckin.statusApproved'
        : latest?.status === 'waiting_for_review'
          ? 'morningCheckin.statusWaiting'
          : latest?.status === 'rejected'
            ? 'morningCheckin.statusRejected'
            : 'morningCheckin.statusOther';
    const metaParts = [
      latest?.vehiclePlate,
      latest?.companyName,
      latest?.cargoName,
      latest?.cargoQuantity,
    ].filter(Boolean);
    return (
      <ScreenLayout title={t('morningCheckin.title')} subtitle={t('morningCheckin.subtitle')}>
        <View style={styles.doneCard}>
          <Text style={styles.doneTitle}>{t('morningCheckin.alreadyExistsTitle')}</Text>
          <Text style={styles.statusPill}>{t(statusKey)}</Text>
          <Text style={styles.doneBody}>{t('morningCheckin.alreadyExistsBody')}</Text>
          {metaParts.length > 0 ? (
            <Text style={styles.doneMeta}>{metaParts.join(' · ')}</Text>
          ) : null}
          <ActionButton
            label={t('morningCheckin.goToTodayForGps')}
            onPress={() => router.replace('/(app)/today')}
            variant="primary"
          />
        </View>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout title={t('morningCheckin.title')} subtitle={t('morningCheckin.subtitle')}>
      <View style={styles.form}>
        <Text style={styles.info}>{t('morningCheckin.locationHint')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('morningCheckin.vehiclePlate')}
          value={vehiclePlate}
          onChangeText={setVehiclePlate}
        />
        <TextInput
          style={styles.input}
          placeholder={t('morningCheckin.companyName')}
          value={companyName}
          onChangeText={setCompanyName}
        />
        <TextInput
          style={styles.input}
          placeholder={t('morningCheckin.cargoName')}
          value={cargoName}
          onChangeText={setCargoName}
        />
        <TextInput
          style={styles.input}
          placeholder={t('morningCheckin.cargoQuantity')}
          value={cargoQuantity}
          onChangeText={setCargoQuantity}
          keyboardType="default"
        />
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        <Pressable
          style={[styles.button, createMutation.isPending && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={createMutation.isPending}
        >
          <Text style={styles.buttonText}>
            {createMutation.isPending ? t('morningCheckin.submitting') : t('morningCheckin.submit')}
          </Text>
        </Pressable>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 10,
  },
  doneCard: {
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  doneTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#14532D',
  },
  statusPill: {
    alignSelf: 'flex-start',
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  doneBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#166534',
  },
  doneMeta: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '600',
  },
  info: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
