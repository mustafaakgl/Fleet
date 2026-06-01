import { useState } from 'react';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

export default function MorningCheckinScreen() {
  const queryClient = useQueryClient();
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [notes, setNotes] = useState('');

  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['morning-checkins'],
    queryFn: () => driverApi.listMorningCheckins(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      driverApi.createMorningCheckin({
        date: new Date().toISOString(),
        vehiclePlate,
        companyName,
        notes,
      }),
    onSuccess: () => {
      setVehiclePlate('');
      setCompanyName('');
      setNotes('');
      void queryClient.invalidateQueries({ queryKey: ['morning-checkins'] });
      showSuccess('Morning check-in submitted.');
      router.back();
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to submit check-in.'));
    },
  });

  const onSubmit = () => {
    if (!vehiclePlate.trim() || !companyName.trim()) {
      setValidationError('Vehicle plate and company name are required.');
      return;
    }
    setValidationError(null);
    createMutation.mutate();
  };

  return (
    <ScreenLayout title="Morning Check-in" subtitle="Submit today check-in">
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Vehicle plate"
          value={vehiclePlate}
          onChangeText={(value) => setVehiclePlate(value)}
        />
        <TextInput
          style={styles.input}
          placeholder="Company name"
          value={companyName}
          onChangeText={(value) => setCompanyName(value)}
        />
        <TextInput style={styles.input} placeholder="Notes" value={notes} onChangeText={setNotes} />
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        <Pressable
          style={[styles.button, createMutation.isPending && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={createMutation.isPending}
        >
          <Text style={styles.buttonText}>{createMutation.isPending ? 'Submitting...' : 'Submit Check-in'}</Text>
        </Pressable>
      </View>
      {isLoading ? <LoadingState label="Loading recent check-ins..." /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, 'Failed to load recent check-ins.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && !error ? <Text>Latest check-ins: {Array.isArray(data) ? data.length : 0}</Text> : null}
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
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
