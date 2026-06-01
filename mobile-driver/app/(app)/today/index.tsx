import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { getErrorMessage } from '@/utils/errors';

export default function HomeTodayScreen() {
  const {
    data: assignments,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['today-assignments'],
    queryFn: () => driverApi.todayAssignments(),
  });

  return (
    <ScreenLayout
      title="Today"
      subtitle="Your assignments and quick actions"
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
      }}
    >
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Assignments Today</Text>
        <Text style={styles.cardValue}>{assignments?.length ?? 0}</Text>
      </View>

      {isLoading ? <LoadingState label="Loading today assignments..." /> : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, 'Could not load assignments.')}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && !error && assignments && assignments.length === 0 ? (
        <EmptyState
          title="No assignments for today"
          message="Pull down to refresh or check again later."
        />
      ) : null}
      {!isLoading && !error && assignments && assignments.length > 0 ? (
        <View style={styles.actions}>
          {assignments.map((assignment) => (
            <Link key={assignment.id} href={`/(app)/today/assignment/${assignment.id}` as never} asChild>
              <Pressable style={styles.assignmentCard}>
                <Text style={styles.assignmentTitle}>{assignment.company.name}</Text>
                <Text style={styles.assignmentMeta}>Vehicle: {assignment.vehicle.plateNumber}</Text>
                <Text style={styles.assignmentMeta}>{assignment.startTime} - {assignment.endTime}</Text>
                <Text style={styles.assignmentMeta}>Cargo: {assignment.cargoName}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <QuickLink href="/(app)/today/morning-checkin" label="Morning Check-in" />
        <QuickLink href="/(app)/today/handover-upload" label="Vehicle Handover Photo Upload" />
        <QuickLink href="/(app)/today/leave-request" label="Leave / Sick Request" />
        <QuickLink href="/(app)/today/accident-report" label="Accident Report" />
        <QuickLink href="/(app)/today/cargo-damage-report" label="Cargo Damage Report" />
      </View>
    </ScreenLayout>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href as never} asChild>
      <Pressable style={styles.linkButton}>
        <Text style={styles.linkText}>{label}</Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 6,
  },
  cardTitle: {
    color: '#4B5563',
    fontSize: 14,
  },
  cardValue: {
    color: '#111827',
    fontSize: 28,
    fontWeight: '700',
  },
  actions: {
    gap: 10,
  },
  linkButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 12,
  },
  linkText: {
    color: '#1F2937',
    fontWeight: '600',
  },
  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  assignmentTitle: {
    fontWeight: '700',
    color: '#111827',
  },
  assignmentMeta: {
    color: '#374151',
    fontSize: 13,
  },
});
