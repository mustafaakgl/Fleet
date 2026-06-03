import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { locationTrackingStore } from '@/features/tracking/store';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { useTranslation } from '@/i18n/useTranslation';

export default function MorningCheckinScreen() {
  const { t } = useTranslation();
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [notes, setNotes] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: async () => {
      const store = locationTrackingStore.getState();
      const consentReady = await store.prepareLocationConsent();
      const checkin = await driverApi.createMorningCheckin({
        date: new Date().toISOString(),
        vehiclePlate,
        companyName,
        notes,
      });
      const sharingStarted = consentReady ? await store.activateLocationSharing() : false;
      return { checkin, sharingStarted };
    },
    onSuccess: ({ sharingStarted }) => {
      setVehiclePlate('');
      setCompanyName('');
      setNotes('');
      showSuccess(
        sharingStarted ? t('morningCheckin.successWithLocation') : t('morningCheckin.success'),
      );
      router.back();
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('morningCheckin.submitFailed')));
    },
  });

  const onSubmit = () => {
    if (!vehiclePlate.trim() || !companyName.trim()) {
      setValidationError(t('morningCheckin.validationRequired'));
      return;
    }
    setValidationError(null);
    createMutation.mutate();
  };

  return (
    <ScreenLayout title={t('morningCheckin.title')} subtitle={t('morningCheckin.subtitle')}>
      <View style={styles.form}>
        <Text style={styles.info}>{t('morningCheckin.locationHint')}</Text>
        <TextInput
          style={styles.input}
          placeholder={t('morningCheckin.vehiclePlate')}
          value={vehiclePlate}
          onChangeText={(value) => setVehiclePlate(value)}
        />
        <TextInput
          style={styles.input}
          placeholder={t('morningCheckin.companyName')}
          value={companyName}
          onChangeText={(value) => setCompanyName(value)}
        />
        <TextInput
          style={styles.input}
          placeholder={t('morningCheckin.notes')}
          value={notes}
          onChangeText={setNotes}
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
