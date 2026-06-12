import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, shadows, spacing, typography } from '@/theme';

export function FleetFuelCard() {
  const { t } = useTranslation();

  if (Platform.OS === 'web') {
    return null;
  }

  return (
    <Pressable style={styles.card} onPress={() => router.push('/(app)/today/fuel')}>
      <View style={styles.header}>
        <Feather name="droplet" size={18} color={colors.accent} />
        <Text style={styles.title}>{t('fleetFuel.compactTitle')}</Text>
        <Feather name="chevron-right" size={18} color={colors.muted} />
      </View>
      <Text style={styles.hint}>{t('fleetFuel.compactHint')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    ...typography.h3,
  },
  hint: {
    color: colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
});
