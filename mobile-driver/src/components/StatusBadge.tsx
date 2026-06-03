import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '@/theme';

type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

export function StatusBadge({ label, tone = 'neutral' }: { label: string; tone?: StatusTone }) {
  return (
    <View
      style={[
        styles.badge,
        tone === 'success' && styles.success,
        tone === 'warning' && styles.warning,
        tone === 'danger' && styles.danger,
      ]}
    >
      <Text
        style={[
          styles.text,
          tone === 'success' && styles.successText,
          tone === 'warning' && styles.warningText,
          tone === 'danger' && styles.dangerText,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: colors.border,
    alignSelf: 'flex-start',
  },
  text: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  success: { backgroundColor: colors.successSoft },
  warning: { backgroundColor: colors.warningSoft },
  danger: { backgroundColor: colors.dangerSoft },
  successText: { color: colors.success },
  warningText: { color: '#B45309' },
  dangerText: { color: colors.danger },
});
