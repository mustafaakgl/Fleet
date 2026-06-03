import { PropsWithChildren } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '@/theme';

export function Card({
  children,
  style,
  elevated = true,
}: PropsWithChildren<{ style?: ViewStyle; elevated?: boolean }>) {
  return <View style={[styles.card, elevated && shadows.sm, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
});
