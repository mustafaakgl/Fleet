import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '@/theme/colors';

export function RequestTypeCard({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.card, selected && styles.selected]} onPress={onPress}>
      <Text style={[styles.label, selected && styles.selectedLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 74,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    backgroundColor: colors.card,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  selected: {
    borderColor: colors.accent,
    backgroundColor: '#EFF6FF',
  },
  label: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  selectedLabel: {
    color: '#1D4ED8',
  },
});
