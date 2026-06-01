import { useQuery } from '@tanstack/react-query';
import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { getErrorMessage } from '@/utils/errors';
import { authStore } from '@/features/auth/store';

export default function HomeTodayScreen() {
  const clearSession = authStore((s) => s.clearSession);
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

  const handleLogout = async () => {
    await clearSession();
    router.replace('/(auth)/login');
  };

  return (
    <ScreenLayout
      title="Fleet Driver Today"
      subtitle="Your assignments for today"
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
      }}
    >
      <View style={styles.summaryCard}>
        <Text style={styles.cardTitle}>Assignments Today</Text>
        <Text style={styles.cardValue}>{assignments?.length ?? 0}</Text>
        <Pressable style={styles.logoutButton} onPress={() => void handleLogout()}>
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
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
        <View style={styles.assignmentList}>
          {assignments.map((assignment) => (
            <View key={assignment.id} style={styles.assignmentCard}>
              <View style={styles.assignmentHeaderRow}>
                <Text style={styles.assignmentTitle}>{assignment.company.name}</Text>
                <StatusBadge status={assignment.status} />
              </View>
              <Text style={styles.assignmentMeta}>Vehicle: {assignment.vehicle.plateNumber}</Text>
              <Text style={styles.assignmentMeta}>Time: {assignment.startTime} - {assignment.endTime}</Text>
              <Text style={styles.assignmentMeta}>Pickup: {assignment.pickupAddress}</Text>
              <Text style={styles.assignmentMeta}>Delivery: {assignment.deliveryAddress}</Text>

              <View style={styles.actionRow}>
                <QuickLink href={`/(app)/today/assignment/${assignment.id}`} label="Open Detail" />
                {isActiveAssignment(assignment.status) ? (
                  <QuickLink href="/(app)/today/morning-checkin" label="Check-in" />
                ) : null}
                {needsHandoverAction(assignment.status) ? (
                  <QuickLink
                    href={`/(app)/today/handover-upload?assignmentId=${assignment.id}&vehicleId=${assignment.vehicle.id}`}
                    label="Handover"
                  />
                ) : null}
                {isActiveAssignment(assignment.status) ? (
                  <>
                    <QuickLink
                      href={`/(app)/today/accident-report?assignmentId=${assignment.id}&vehicleId=${assignment.vehicle.id}`}
                      label="Accident"
                    />
                    <QuickLink
                      href={`/(app)/today/cargo-damage-report?assignmentId=${assignment.id}&vehicleId=${assignment.vehicle.id}`}
                      label="Cargo"
                    />
                  </>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.globalActions}>
        <QuickLink href="/(app)/today/leave-request" label="Leave / Sick Request" />
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

function StatusBadge({ status }: { status: string }) {
  return (
    <View style={styles.statusBadge}>
      <Text style={styles.statusText}>{status.replaceAll('_', ' ')}</Text>
    </View>
  );
}

function isActiveAssignment(status: string) {
  return status === 'planned' || status === 'confirmed' || status === 'in_progress';
}

function needsHandoverAction(status: string) {
  return status === 'planned' || status === 'confirmed';
}

const styles = StyleSheet.create({
  summaryCard: {
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
  assignmentList: {
    gap: 10,
  },
  actions: {
    gap: 10,
  },
  linkButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  linkText: {
    color: '#1F2937',
    fontWeight: '600',
    fontSize: 12,
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
  assignmentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  statusBadge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    color: '#1F2937',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  logoutButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#B91C1C',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logoutText: {
    color: '#B91C1C',
    fontWeight: '600',
    fontSize: 12,
  },
  globalActions: {
    gap: 10,
  },
});
