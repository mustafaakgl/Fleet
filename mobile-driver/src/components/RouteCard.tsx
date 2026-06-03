import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';

export function RouteCard({ pickup, delivery }: { pickup: string; delivery: string }) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{t('assignment.timeline')}</Text>
      <View style={styles.row}>
        <Feather name="map-pin" size={14} color={colors.accent} />
        <View style={styles.col}>
          <Text style={styles.pointLabel}>{t('assignment.pickup')}</Text>
          <Text style={styles.pointValue}>{pickup}</Text>
        </View>
      </View>
      <View style={styles.connector} />
      <View style={styles.row}>
        <Feather name="flag" size={14} color={colors.success} />
        <View style={styles.col}>
          <Text style={styles.pointLabel}>{t('assignment.delivery')}</Text>
          <Text style={styles.pointValue}>{delivery}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: { ...typography.caption, textTransform: 'none', marginBottom: 2 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  col: { flex: 1, gap: 2 },
  connector: {
    width: 2,
    height: 12,
    backgroundColor: colors.border,
    marginLeft: 6,
  },
  pointLabel: { ...typography.caption, textTransform: 'none', fontWeight: '700' },
  pointValue: { ...typography.bodyMedium, fontSize: 14 },
});
