import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';

export default function LeaveSickRequestScreen() {
  const queryClient = useQueryClient();
  const [type, setType] = useState<'vacation' | 'sick_leave' | 'other'>('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['driver-requests'],
    queryFn: () => driverApi.listRequests(),
  });

  const mutation = useMutation({
    mutationFn: () => driverApi.createRequest({ type, startDate, endDate, reason }),
    onSuccess: () => {
      setStartDate('');
      setEndDate('');
      setReason('');
      void queryClient.invalidateQueries({ queryKey: ['driver-requests'] });
      showSuccess('Request submitted.');
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, 'Failed to submit request.'));
    },
  });

  const isValidDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

  const onSubmit = () => {
    if (!isValidDate(startDate) || !isValidDate(endDate)) {
      setValidationError('Start and end date must be in YYYY-MM-DD format.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setValidationError('End date must be after or equal to start date.');
      return;
    }
    setValidationError(null);
    mutation.mutate();
  };

  return (
    <ScreenLayout title="Leave / Sick Request" subtitle="Create and track requests">
      <View style={styles.form}>
        <View style={styles.typeRow}>
          {(['vacation', 'sick_leave', 'other'] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => setType(item)}
              style={[styles.typeChip, type === item && styles.typeChipActive]}
            >
              <Text style={[styles.typeChipText, type === item && styles.typeChipTextActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput style={styles.input} placeholder="Start date (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} />
        <TextInput style={styles.input} placeholder="End date (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} />
        <TextInput style={styles.input} placeholder="Reason" value={reason} onChangeText={setReason} />
        {validationError ? <Text style={styles.error}>{validationError}</Text> : null}
        <Pressable
          style={[styles.button, mutation.isPending && styles.buttonDisabled]}
          onPress={onSubmit}
          disabled={mutation.isPending}
        >
          <Text style={styles.buttonText}>{mutation.isPending ? 'Submitting...' : 'Submit Request'}</Text>
        </Pressable>
      </View>
      {isLoading ? <LoadingState label="Loading requests..." /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, 'Failed to load requests.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && !error ? <Text>Existing requests: {Array.isArray(data) ? data.length : 0}</Text> : null}
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
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
  },
  typeChipActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  typeChipText: {
    color: '#374151',
    fontSize: 12,
  },
  typeChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
});
