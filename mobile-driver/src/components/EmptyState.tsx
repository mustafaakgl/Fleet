import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '@/theme';

export function EmptyState({
  title,
  message,
  icon = 'inbox',
}: {
  title: string;
  message: string;
  icon?: keyof typeof Feather.glyphMap;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={28} color={colors.accent} />
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typography.h3, textAlign: 'center' },
  message: { ...typography.caption, textAlign: 'center', textTransform: 'none', lineHeight: 20 },
});
