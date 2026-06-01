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

export default function AccidentReportScreen() {
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
      showSuccess('Accident report submitted.');
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to submit accident report.'));
    },
  });

  const onSubmit = () => {
    if (!vehicleId.trim()) {
      setValidationError('Vehicle ID is required.');
      return;
    }
    if (!description.trim()) {
      setValidationError('Description is required.');
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  return (
    <ScreenLayout title="Accident Report" subtitle="Submit a vehicle accident report">
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Assignment ID (if available)"
          value={assignmentId}
          onChangeText={setAssignmentId}
        />
        <TextInput style={styles.input} placeholder="Vehicle ID" value={vehicleId} onChangeText={setVehicleId} />
        <TextInput style={styles.input} placeholder="Location" value={location} onChangeText={setLocation} />
        <TextInput style={styles.input} placeholder="Description" value={description} onChangeText={setDescription} />
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        <Pressable
          style={[styles.button, mutation.isPending && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={mutation.isPending}
        >
          <Text style={styles.buttonText}>{mutation.isPending ? 'Submitting...' : 'Submit Accident'}</Text>
        </Pressable>
      </View>
      {isLoading ? <LoadingState label="Loading reported accidents..." /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, 'Failed to load accidents.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && !error ? <Text>Reported accidents: {Array.isArray(data) ? data.length : 0}</Text> : null}
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
