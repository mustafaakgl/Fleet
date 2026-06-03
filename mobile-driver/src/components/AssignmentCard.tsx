import { StyleSheet, Text, View } from 'react-native';
import type { DriverAssignment } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import { RouteCard } from './RouteCard';
import { StatusBadge } from './StatusBadge';

function assignmentTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'completed') return 'success';
  if (status === 'cancelled') return 'danger';
  if (status === 'in_progress') return 'warning';
  return 'neutral';
}

export function AssignmentCard({ assignment }: { assignment: DriverAssignment }) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.company}>{assignment.company.name}</Text>
        <StatusBadge label={assignment.status.replaceAll('_', ' ')} tone={assignmentTone(assignment.status)} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{t('assignment.vehicle')}</Text>
        <Text style={styles.metaValue}>{assignment.vehicle.plateNumber}</Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{t('assignment.time')}</Text>
        <Text style={styles.metaValue}>
          {assignment.startTime} – {assignment.endTime}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>{t('assignment.cargo')}</Text>
        <Text style={styles.metaValue}>{assignment.cargoName}</Text>
      </View>
      <RouteCard pickup={assignment.pickupAddress} delivery={assignment.deliveryAddress} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  company: {
    flex: 1,
    ...typography.h2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metaLabel: { ...typography.caption, textTransform: 'none' },
  metaValue: { ...typography.bodyMedium, color: colors.primary },
});
