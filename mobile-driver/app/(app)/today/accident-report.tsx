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

export default function AccidentReportScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ assignmentId?: string; vehicleId?: string }>();
  const queryClient = useQueryClient();
  const [vehicleId, setVehicleId] = useState(params.vehicleId ?? '');
  const [assignmentId, setAssignmentId] = useState(params.assignmentId ?? '');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['driver-accidents', 'vehicle_accident'],
    queryFn: () => driverApi.listAccidents({ type: 'vehicle_accident' }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      driverApi.createAccident({
        type: 'vehicle_accident',
        vehicleId,
        assignmentId: assignmentId || undefined,
        incidentDateTime: new Date().toISOString(),
        description,
        location,
      }),
    onSuccess: () => {
      setVehicleId('');
      setAssignmentId('');
      setDescription('');
      setLocation('');
      void queryClient.invalidateQueries({ queryKey: ['driver-accidents', 'vehicle_accident'] });
      showSuccess(t('accidentReport.success'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('accidentReport.submitFailed')));
    },
  });

  const onSubmit = () => {
    if (!vehicleId.trim()) {
      setValidationError(t('accidentReport.validationVehicle'));
      return;
    }
    if (!description.trim()) {
      setValidationError(t('accidentReport.validationDescription'));
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  return (
    <ScreenLayout title={t('accidentReport.title')} subtitle={t('accidentReport.subtitle')}>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('accidentReport.assignmentId')}
          value={assignmentId}
          onChangeText={setAssignmentId}
        />
        <TextInput
          style={styles.input}
          placeholder={t('accidentReport.vehicleId')}
          value={vehicleId}
          onChangeText={setVehicleId}
        />
        <TextInput
          style={styles.input}
          placeholder={t('accidentReport.location')}
          value={location}
          onChangeText={setLocation}
        />
        <TextInput
          style={styles.input}
          placeholder={t('accidentReport.description')}
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
            {mutation.isPending ? t('accidentReport.submitting') : t('accidentReport.submit')}
          </Text>
        </Pressable>
      </View>
      {isLoading ? <LoadingState label={t('accidentReport.loading')} /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, t('accidentReport.loadFailed'))}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && !error ? (
        <Text>{t('accidentReport.count', { count: Array.isArray(data) ? data.length : 0 })}</Text>
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
