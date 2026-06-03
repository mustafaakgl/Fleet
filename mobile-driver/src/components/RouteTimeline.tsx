import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { openMapsAddress } from '@/lib/maps';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';

export function RouteTimeline({
  pickup,
  delivery,
  showMapActions = true,
}: {
  pickup: string;
  delivery: string;
  showMapActions?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>{t('assignment.timeline')}</Text>
      <View style={styles.row}>
        <View style={styles.lineCol}>
          <View style={[styles.dot, styles.dotPickup]} />
          <View style={styles.line} />
          <View style={[styles.dot, styles.dotDelivery]} />
        </View>
        <View style={styles.stops}>
          <View style={styles.stop}>
            <Text style={styles.stopLabel}>{t('assignment.pickup')}</Text>
            <Text style={styles.stopValue}>{pickup}</Text>
            {showMapActions ? (
              <Pressable style={styles.mapBtn} onPress={() => void openMapsAddress(pickup)}>
                <Feather name="map-pin" size={14} color={colors.accent} />
                <Text style={styles.mapBtnText}>{t('assignment.openMaps')}</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={styles.stop}>
            <Text style={styles.stopLabel}>{t('assignment.delivery')}</Text>
            <Text style={styles.stopValue}>{delivery}</Text>
            {showMapActions ? (
              <Pressable style={styles.mapBtn} onPress={() => void openMapsAddress(delivery)}>
                <Feather name="map-pin" size={14} color={colors.accent} />
                <Text style={styles.mapBtnText}>{t('assignment.openMaps')}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: { ...typography.label },
  row: { flexDirection: 'row', gap: spacing.md },
  lineCol: { alignItems: 'center', width: 16, paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotPickup: { backgroundColor: colors.accent },
  dotDelivery: { backgroundColor: colors.success },
  line: { flex: 1, width: 2, backgroundColor: colors.border, minHeight: 48, marginVertical: 4 },
  stops: { flex: 1, gap: spacing.lg },
  stop: { gap: spacing.xs },
  stopLabel: { ...typography.caption, textTransform: 'none', fontWeight: '700' },
  stopValue: { ...typography.bodyMedium, color: colors.primary },
  mapBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  mapBtnText: { color: colors.accent, fontSize: 13, fontWeight: '600' },
});
