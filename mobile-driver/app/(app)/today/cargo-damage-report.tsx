import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { useTranslation } from '@/i18n/useTranslation';

export default function CargoDamageReportScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ assignmentId?: string; vehicleId?: string }>();
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState(params.vehicleId ?? '');
  const [assignmentId, setAssignmentId] = useState(params.assignmentId ?? '');
  const [cargoName, setCargoName] = useState('');
  const [cargoOwner, setCargoOwner] = useState('');
  const [description, setDescription] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['driver-accidents', 'cargo_damage'],
    queryFn: () => driverApi.listAccidents({ type: 'cargo_damage' }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      driverApi.createAccident({
        type: 'cargo_damage',
        vehicleId: vehicleId || undefined,
        assignmentId: assignmentId || undefined,
        incidentDateTime: new Date().toISOString(),
        cargoName,
        cargoOwner,
        description,
      }),
    onSuccess: () => {
      setVehicleId('');
      setAssignmentId('');
      setCargoName('');
      setCargoOwner('');
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: ['driver-accidents', 'cargo_damage'] });
      showSuccess(t('cargoDamage.success'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('cargoDamage.submitFailed')));
    },
  });

  const onSubmit = () => {
    if (!cargoName.trim() || !cargoOwner.trim() || !description.trim()) {
      setValidationError(t('cargoDamage.validationFields'));
      return;
    }
    if (!assignmentId.trim() && !vehicleId.trim()) {
      setValidationError(t('cargoDamage.validationVehicle'));
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  return (
    <ScreenLayout title={t('cargoDamage.title')} subtitle={t('cargoDamage.subtitle')}>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('cargoDamage.assignmentId')}
          value={assignmentId}
          onChangeText={setAssignmentId}
        />
        <TextInput
          style={styles.input}
          placeholder={t('cargoDamage.vehicleId')}
          value={vehicleId}
          onChangeText={setVehicleId}
        />
        <TextInput
          style={styles.input}
          placeholder={t('cargoDamage.cargoName')}
          value={cargoName}
          onChangeText={setCargoName}
        />
        <TextInput
          style={styles.input}
          placeholder={t('cargoDamage.cargoOwner')}
          value={cargoOwner}
          onChangeText={setCargoOwner}
        />
        <TextInput
          style={styles.input}
          placeholder={t('cargoDamage.description')}
          value={description}
          onChangeText={setDescription}
        />
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        <Pressable
          style={[styles.button, mutation.isPending && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={mutation.isPending}
        >
          <Text style={styles.buttonText}>
            {mutation.isPending ? t('cargoDamage.submitting') : t('cargoDamage.submit')}
          </Text>
        </Pressable>
      </View>
      {isLoading ? <LoadingState label={t('cargoDamage.loading')} /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, t('cargoDamage.loadFailed'))}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && !error ? (
        <Text>{t('cargoDamage.count', { count: Array.isArray(data) ? data.length : 0 })}</Text>
      ) : null}
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 10,
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
  buttonDisabled: {
    opacity: 0.6,
  },
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
});
