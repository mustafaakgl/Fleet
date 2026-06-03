import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { driverApi } from '@/api/endpoints';
import { locationTrackingStore } from '@/features/tracking/store';
import { useTranslation } from '@/i18n/useTranslation';
import { localTodayDate } from '@/lib/calendar-date';
import { colors, radius, spacing, typography } from '@/theme';

type BannerTone = 'info' | 'success' | 'warning' | 'action';

function toneStyles(tone: BannerTone) {
  if (tone === 'success') {
    return { bg: colors.successSoft, border: '#86EFAC', text: '#166534' };
  }
  if (tone === 'warning') {
    return { bg: colors.warningSoft, border: '#FCD34D', text: '#92400E' };
  }
  if (tone === 'action') {
    return { bg: colors.accentSoft, border: colors.borderFocus, text: colors.primary };
  }
  return { bg: '#F8FAFC', border: colors.border, text: colors.subtext };
}

export function DayStatusBanner() {
  const { t } = useTranslation();
  const status = locationTrackingStore((state) => state.status);
  const { data: checkins } = useQuery({
    queryKey: ['morning-checkins', localTodayDate()],
    queryFn: () => driverApi.listMorningCheckins(localTodayDate()),
  });

  const todayCheckin = checkins?.[0];
  const checkinStatus = todayCheckin?.status;
  const sharingActive = Boolean(status?.sharingActive);
  const trackingActive = Boolean(status?.trackingAllowed) && sharingActive;

  let message = t('dayStatus.noCheckin');
  let tone: BannerTone = 'action';
  let ctaLabel: string | null = t('dayStatus.ctaCheckin');
  let onPress: (() => void) | null = () => router.push('/(app)/today/morning-checkin');

  if (checkinStatus === 'waiting_for_review') {
    message = t('dayStatus.waitingReview');
    tone = 'warning';
    ctaLabel = null;
    onPress = null;
  } else if (checkinStatus === 'rejected') {
    message = t('dayStatus.rejected');
    tone = 'warning';
    ctaLabel = t('dayStatus.ctaContact');
    onPress = () => router.push('/(app)/messages');
  } else if (
    checkinStatus === 'added_to_einsatzplan' ||
    checkinStatus === 'confirmed'
  ) {
    if (trackingActive) {
      message = t('dayStatus.trackingActive');
      tone = 'success';
      ctaLabel = null;
      onPress = null;
    } else if (sharingActive) {
      message = t('dayStatus.sharingWaitingGps');
      tone = 'info';
      ctaLabel = null;
      onPress = null;
    } else {
      message = t('dayStatus.approvedStartJourney');
      tone = 'action';
      ctaLabel = t('location.startJourney');
      onPress = null;
    }
  } else if (todayCheckin) {
    message = t('dayStatus.submitted');
    tone = 'info';
    ctaLabel = null;
    onPress = null;
  }

  const palette = toneStyles(tone);

  return (
    <Pressable
      style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}
      onPress={onPress ?? undefined}
      disabled={!onPress}
    >
      <Feather
        name={trackingActive ? 'navigation' : 'info'}
        size={18}
        color={palette.text}
        style={styles.icon}
      />
      <View style={styles.textBlock}>
        <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
        {ctaLabel ? (
          <Text style={[styles.cta, { color: colors.accent }]}>{ctaLabel}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  icon: { marginTop: 2 },
  textBlock: { flex: 1, gap: 4 },
  message: { ...typography.bodyMedium, fontSize: 14 },
  cta: { fontSize: 13, fontWeight: '700' },
});
