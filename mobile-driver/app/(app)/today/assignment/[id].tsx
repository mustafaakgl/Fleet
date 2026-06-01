import { Link, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { getErrorMessage } from '@/utils/errors';

export default function AssignmentDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const assignmentId = typeof params.id === 'string' ? params.id : '';
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: () => driverApi.assignmentById(assignmentId),
    enabled: Boolean(assignmentId),
  });

  return (
    <ScreenLayout title="Assignment Detail" subtitle={`Assignment ${assignmentId}`}>
      {!assignmentId ? <ErrorState message="Missing assignment id." /> : null}
      {assignmentId && isLoading ? <LoadingState label="Loading assignment details..." /> : null}
      {assignmentId && !isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, 'Failed to load assignment.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {assignmentId && data ? (
        <>
          <View style={styles.card}>
            <Text style={styles.title}>{data.company.name}</Text>
            <Text style={styles.row}>Vehicle: {data.vehicle.plateNumber}</Text>
            <Text style={styles.row}>Cargo: {data.cargoName} ({data.cargoOwner})</Text>
            <Text style={styles.row}>Pickup: {data.pickupAddress}</Text>
            <Text style={styles.row}>Delivery: {data.deliveryAddress}</Text>
            <Text style={styles.row}>Time: {data.startTime} - {data.endTime}</Text>
          </View>

          <View style={styles.actions}>
            <ActionLink href="/(app)/today/morning-checkin" label="Morning Check-in" />
            <ActionLink href={`/(app)/today/handover-upload?assignmentId=${data.id}&vehicleId=${data.vehicle.id}`} label="Handover Photo" />
            <ActionLink href={`/(app)/today/accident-report?assignmentId=${data.id}&vehicleId=${data.vehicle.id}`} label="Accident Report" />
            <ActionLink href={`/(app)/today/cargo-damage-report?assignmentId=${data.id}&vehicleId=${data.vehicle.id}`} label="Cargo Damage Report" />
          </View>
        </>
      ) : null}
    </ScreenLayout>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href as never} asChild>
      <Pressable style={styles.actionButton}>
        <Text style={styles.actionButtonText}>{label}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
    gap: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  row: {
    color: '#374151',
  },
  actions: {
    gap: 10,
  },
  actionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  actionButtonText: {
    color: '#1F2937',
    fontWeight: '600',
  },
});
