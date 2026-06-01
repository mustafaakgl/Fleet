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

export default function CargoDamageReportScreen() {
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
      showSuccess('Cargo damage report submitted.');
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to submit cargo damage report.'));
    },
  });

  const onSubmit = () => {
    if (!cargoName.trim() || !cargoOwner.trim() || !description.trim()) {
      setValidationError('Cargo name, cargo owner and description are required.');
      return;
    }
    if (!assignmentId.trim() && !vehicleId.trim()) {
      setValidationError('Vehicle ID is required when assignment ID is not provided.');
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  return (
    <ScreenLayout title="Cargo Damage Report" subtitle="Submit cargo damage details">
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Assignment ID (optional)"
          value={assignmentId}
          onChangeText={setAssignmentId}
        />
        <TextInput style={styles.input} placeholder="Vehicle ID" value={vehicleId} onChangeText={setVehicleId} />
        <TextInput style={styles.input} placeholder="Cargo name" value={cargoName} onChangeText={setCargoName} />
        <TextInput style={styles.input} placeholder="Cargo owner" value={cargoOwner} onChangeText={setCargoOwner} />
        <TextInput style={styles.input} placeholder="Description" value={description} onChangeText={setDescription} />
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        <Pressable
          style={[styles.button, mutation.isPending && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={mutation.isPending}
        >
          <Text style={styles.buttonText}>{mutation.isPending ? 'Submitting...' : 'Submit Cargo Damage'}</Text>
        </Pressable>
      </View>
      {isLoading ? <LoadingState label="Loading cargo damage reports..." /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, 'Failed to load cargo damage reports.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && !error ? <Text>Reported cargo damages: {Array.isArray(data) ? data.length : 0}</Text> : null}
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
