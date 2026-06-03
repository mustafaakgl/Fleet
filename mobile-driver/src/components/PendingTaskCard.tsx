import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';

export function PendingTaskCard({
  missingHandover,
  unreadMessages,
  unreadNotifications,
  pendingRequests,
}: {
  missingHandover: number;
  unreadMessages: number;
  unreadNotifications: number;
  pendingRequests: number;
}) {
  const { t } = useTranslation();
  const items = [
    { icon: 'camera' as const, label: t('home.summaryHandover'), count: missingHandover },
    { icon: 'message-circle' as const, label: t('home.summaryMessages'), count: unreadMessages },
    { icon: 'bell' as const, label: t('home.summaryNotifications'), count: unreadNotifications },
    { icon: 'file-text' as const, label: t('home.summaryRequests'), count: pendingRequests },
  ].filter((item) => item.count > 0);

  if (items.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('pending.title')}</Text>
      {items.map((item) => (
        <View key={item.label} style={styles.row}>
          <Feather name={item.icon} size={16} color={colors.accent} />
          <Text style={styles.item}>{item.label}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{item.count}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...typography.h3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  item: {
    flex: 1,
    color: colors.subtext,
    fontSize: 14,
    fontWeight: '500',
  },
  badge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: '700' },
});
