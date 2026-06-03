import { StyleSheet, Text, View } from 'react-native';
import type { MessengerMessage } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short' });
}

export function MessageBubble({
  message,
  mine,
}: {
  message: MessengerMessage;
  mine: boolean;
}) {
  const { t } = useTranslation();
  const showTranslationFirst = !mine && Boolean(message.translatedText);

  return (
    <View style={[styles.messageBubble, mine ? styles.mine : styles.other]}>
      <Text style={styles.sender}>{message.senderName}</Text>
      {showTranslationFirst ? (
        <>
          <Text style={styles.primaryText}>{message.translatedText}</Text>
          <Text style={styles.secondaryText}>
            {t('messages.original', { lang: message.originalLanguage })}: {message.originalText}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.primaryText}>{message.originalText}</Text>
          {message.translatedText ? (
            <Text style={styles.secondaryText}>{message.translatedText}</Text>
          ) : null}
        </>
      )}
      {message.translationStatus === 'failed' ? (
        <Text style={styles.warning}>Translation unavailable</Text>
      ) : null}
      <Text style={styles.timestamp}>{formatDateTime(message.createdAt)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  messageBubble: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
    maxWidth: '88%',
  },
  mine: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accentSoft,
    borderColor: colors.borderFocus,
  },
  other: {
    alignSelf: 'flex-start',
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  sender: {
    ...typography.caption,
    textTransform: 'none',
    fontWeight: '700',
  },
  primaryText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  },
  secondaryText: {
    color: colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  warning: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
  },
  timestamp: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 2,
  },
});
