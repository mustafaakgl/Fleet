import { Feather } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi, messengerApi } from '@/api/endpoints';
import { SkeletonCard } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { AssignmentCard } from '@/components/AssignmentCard';
import { ActionButton } from '@/components/ActionButton';
import { PendingTaskCard } from '@/components/PendingTaskCard';
import { DayStatusBanner } from '@/components/DayStatusBanner';
import { LocationTrackingCard } from '@/components/LocationTrackingCard';
import { ListRow } from '@/components/ListRow';
import { SectionHeader } from '@/components/SectionHeader';
import { formatAppDate } from '@/i18n/format';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { localTodayDate } from '@/lib/calendar-date';

export default function HomeTodayScreen() {
  const { t, locale } = useTranslation();
  const {
    data: assignments,
    isLoading,
    isRefetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['today-assignments', localTodayDate()],
    queryFn: () => driverApi.todayAssignments(localTodayDate()),
    staleTime: 0,
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const { data: me } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
  });
  const { data: handovers } = useQuery({
    queryKey: ['driver-handovers'],
    queryFn: () => driverApi.listHandovers({ photoStatus: 'missing' }),
  });
  const { data: unreadMessages } = useQuery({
    queryKey: ['messenger-unread-count'],
    queryFn: () => messengerApi.getUnreadCount(),
  });
  const { data: unreadNotifications } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => driverApi.unreadNotifications(),
  });
  const { data: requests } = useQuery({
    queryKey: ['driver-requests'],
    queryFn: () => driverApi.listRequests(),
  });
  const { data: licenseStatus } = useQuery({
    queryKey: ['license-check-status'],
    queryFn: () => driverApi.licenseCheckStatus(),
  });
  const { data: fines } = useQuery({
    queryKey: ['driver-fines'],
    queryFn: () => driverApi.listFines(),
  });
  const { data: departureStatus } = useQuery({
    queryKey: ['departure-check-status'],
    queryFn: () => driverApi.departureCheckStatus(),
  });
  const { data: defects } = useQuery({
    queryKey: ['driver-defects'],
    queryFn: () => driverApi.listDefects(),
  });

  const todayAssignments = assignments ?? [];
  const pendingRequests = (requests ?? []).filter((item) => item.status === 'pending').length;
  const pendingFines = (fines ?? []).filter((fine) => fine.pending_ack).length;
  const pendingDefects = (defects ?? []).filter((defect) => defect.pending_confirmation).length;
  const departureDue = Boolean(departureStatus?.can_submit);
  const greetingName = me?.driver.firstName ?? 'Driver';
  const today = formatAppDate(locale);

  return (
    <ScreenLayout
      title={t('home.title')}
      subtitle={t('home.subtitle')}
      refreshing={isRefetching}
      onRefresh={() => {
        void refetch();
      }}
    >
      <View style={styles.greetingCard}>
        <View style={styles.greetingTop}>
          <View>
            <Text style={styles.greeting}>{t('home.greeting', { name: greetingName })}</Text>
            <Text style={styles.greetingSub}>{today}</Text>
          </View>
          <View style={styles.brandMark}>
            <Feather name="truck" size={22} color={colors.white} />
          </View>
        </View>
        {me?.driver.status ? (
          <Text style={styles.statusPill}>
            {t('home.status')}: {me.driver.status.replaceAll('_', ' ')}
          </Text>
        ) : null}
      </View>

      <DayStatusBanner />

      {licenseStatus?.can_submit ? (
        <View style={styles.licenseTaskCard}>
          <Text style={styles.licenseTaskTitle}>{t('licenseCheck.taskTitle')}</Text>
          <Text style={styles.licenseTaskText}>{t('licenseCheck.taskBody')}</Text>
          <ActionButton
            label={t('licenseCheck.start')}
            onPress={() => router.push('/(app)/today/license-check')}
            variant="primary"
          />
        </View>
      ) : null}

      {departureDue ? (
        <View style={styles.departureTaskCard}>
          <Text style={styles.departureTaskTitle}>{t('departureCheck.taskTitle')}</Text>
          <Text style={styles.departureTaskText}>{t('departureCheck.taskBody')}</Text>
          <ActionButton
            label={t('departureCheck.start')}
            onPress={() => router.push('/(app)/today/departure-check')}
            variant="primary"
          />
        </View>
      ) : null}

      {pendingFines > 0 ? (
        <View style={styles.fineTaskCard}>
          <Text style={styles.fineTaskTitle}>{t('fines.taskTitle')}</Text>
          <Text style={styles.fineTaskText}>{t('fines.taskBody', { count: pendingFines })}</Text>
          <ActionButton
            label={t('fines.openList')}
            onPress={() => router.push('/(app)/today/fines')}
            variant="primary"
          />
        </View>
      ) : null}

      <SectionHeader title={t('home.locationSection')} />
      <LocationTrackingCard />

      <View style={styles.summaryRow}>
        <SummaryChip
          icon="briefcase"
          label={t('home.summaryMessages')}
          value={unreadMessages?.total ?? 0}
          onPress={() => router.push('/(app)/messages')}
        />
        <SummaryChip
          icon="bell"
          label={t('home.summaryNotifications')}
          value={unreadNotifications?.count ?? 0}
          onPress={() => router.push('/(app)/notifications')}
        />
      </View>

      {isLoading ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : null}
      {!isLoading && error ? (
        <ErrorState
          message={getErrorMessage(error, t('home.loadError'))}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}
      {!isLoading && !error && assignments && assignments.length === 0 ? (
        <EmptyState
          title={t('home.noAssignments')}
          message={t('home.noAssignmentsHint')}
          icon="calendar"
        />
      ) : null}
      {!isLoading && !error && todayAssignments.length > 0 ? (
        <>
          <SectionHeader title={t('home.summaryAssignments')} />
          {todayAssignments.map((assignment) => (
            <View key={assignment.id} style={styles.assignmentBlock}>
              <AssignmentCard assignment={assignment} />
              <ActionButton
                label={t('home.openAssignment')}
                onPress={() => router.push(`/(app)/today/assignment/${assignment.id}`)}
                variant="primary"
              />
            </View>
          ))}

          {todayAssignments[0] ? (
            <>
              <SectionHeader title={t('home.quickActions')} />
              <View style={styles.actionGrid}>
                <ActionButton label={t('home.morningCheckin')} onPress={() => router.push('/(app)/today/morning-checkin')} />
                <ActionButton
                  label={t('home.handoverPhoto')}
                  onPress={() =>
                    router.push(
                      `/(app)/today/handover-upload?assignmentId=${todayAssignments[0].id}&vehicleId=${todayAssignments[0].vehicle.id}`,
                    )
                  }
                />
                <ActionButton
                  label={t('home.reportAccident')}
                  onPress={() =>
                    router.push(
                      `/(app)/today/accident-report?assignmentId=${todayAssignments[0].id}&vehicleId=${todayAssignments[0].vehicle.id}`,
                    )
                  }
                  variant="danger"
                />
                <ActionButton
                  label={t('home.reportCargo')}
                  onPress={() =>
                    router.push(
                      `/(app)/today/cargo-damage-report?assignmentId=${todayAssignments[0].id}&vehicleId=${todayAssignments[0].vehicle.id}`,
                    )
                  }
                  variant="danger"
                />
              </View>

              <PendingTaskCard
                missingHandover={handovers?.length ?? 0}
                unreadMessages={unreadMessages?.total ?? 0}
                unreadNotifications={unreadNotifications?.count ?? 0}
                pendingRequests={pendingRequests}
              />
            </>
          ) : null}
        </>
      ) : null}

      <ListRow
        icon="file-text"
        title={t('home.openRequests')}
        subtitle={t('home.pendingCount', { count: pendingRequests })}
        onPress={() => router.push('/(app)/requests')}
        showChevron
      />
      <ListRow
        icon="alert-circle"
        title={t('fines.title')}
        subtitle={t('fines.listSubtitle', { count: fines?.length ?? 0 })}
        badge={pendingFines > 0 ? pendingFines : undefined}
        onPress={() => router.push('/(app)/today/fines')}
        showChevron
      />
      <ListRow
        icon="tool"
        title={t('defects.title')}
        subtitle={t('defects.listSubtitle', { count: defects?.length ?? 0 })}
        badge={pendingDefects > 0 ? pendingDefects : undefined}
        onPress={() => router.push('/(app)/today/defects')}
        showChevron
      />
    </ScreenLayout>
  );
}

function SummaryChip({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: number;
  onPress: () => void;
}) {
  return (
    <ListRow
      icon={icon}
      title={label}
      subtitle={String(value)}
      badge={value}
      onPress={onPress}
      showChevron
    />
  );
}

const styles = StyleSheet.create({
  assignmentBlock: {
    gap: 8,
    marginBottom: 8,
  },
  greetingCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.md,
  },
  greetingTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    color: colors.white,
    fontSize: 20,
    fontWeight: '700',
  },
  greetingSub: {
    color: '#94A3B8',
    fontSize: 13,
    marginTop: 2,
  },
  brandMark: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  licenseTaskCard: {
    backgroundColor: colors.warningSoft,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  licenseTaskTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  licenseTaskText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  fineTaskCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  fineTaskTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  fineTaskText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  departureTaskCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  departureTaskTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  departureTaskText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
  statusPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  summaryRow: {
    gap: spacing.sm,
  },
  actionGrid: {
    gap: spacing.sm,
  },
});
