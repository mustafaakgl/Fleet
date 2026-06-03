import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '@/theme';

export function SkeletonBlock({ height = 16, style }: { height?: number; style?: ViewStyle }) {
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.75, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return <Animated.View style={[styles.block, { height, opacity }, style]} />;
}

export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonBlock height={20} style={styles.w70} />
      <SkeletonBlock height={14} />
      <SkeletonBlock height={14} style={styles.w50} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.border,
    borderRadius: radius.sm,
    width: '100%',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  w70: { width: '70%' },
  w50: { width: '50%' },
});
