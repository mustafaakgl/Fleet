import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, spacing, typography } from '@/theme';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();

  return (
    <View style={styles.wrap}>
      <Feather name="alert-circle" size={32} color={colors.danger} />
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <Button label={t('common.retry')} onPress={onRetry} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  message: {
    ...typography.body,
    color: colors.danger,
    textAlign: 'center',
  },
});
