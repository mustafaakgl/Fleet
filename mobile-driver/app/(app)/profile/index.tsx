import { router, Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { driverApi } from '@/api/endpoints';
import { authStore } from '@/features/auth/store';
import { SkeletonCard } from '@/components/Skeleton';
import { ErrorState } from '@/components/ErrorState';
import { ActionButton } from '@/components/ActionButton';
import { LocationTrackingCard } from '@/components/LocationTrackingCard';
import { ListRow } from '@/components/ListRow';
import { SectionHeader } from '@/components/SectionHeader';
import { Avatar } from '@/components/Avatar';
import type { MessengerLanguage } from '@/api/types';
import { useTranslation } from '@/i18n/useTranslation';
import { colors, radius, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';
import { showError, showSuccess } from '@/utils/feedback';
import { Card } from '@/components/ui/Card';

const LANGUAGE_OPTIONS = [
  { code: 'pl', label: 'Polski' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'it', label: 'Italiano' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'de', label: 'Deutsch' },
  { code: 'en', label: 'English' },
] as const;

export default function ProfileSettingsScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const clearSession = authStore((s) => s.clearSession);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-me'],
    queryFn: () => driverApi.me(),
  });
  const languageMutation = useMutation({
    mutationFn: (language: MessengerLanguage) => driverApi.updateLanguage(language),
    onSuccess: async (profile) => {
      const language = profile.user.language ?? 'de';
      await authStore.getState().updateSessionLanguage(language);
      queryClient.setQueryData(['driver-me'], profile);
      await queryClient.invalidateQueries({ queryKey: ['driver-me'] });
      showSuccess(t('profile.languageUpdated'));
    },
    onError: (mutationError) => {
      showError(getErrorMessage(mutationError, t('profile.languageFailed')));
    },
  });

  const handleLogout = async () => {
    queryClient.clear();
    await clearSession();
    router.replace('/(auth)/login');
  };

  const fullName = data ? `${data.driver.firstName} ${data.driver.lastName}`.trim() : '';

  return (
    <>
      <Stack.Screen options={{ title: t('profile.title') }} />
      <ScreenLayout title={t('profile.title')} subtitle={t('profile.subtitle')}>
        {isLoading ? <SkeletonCard /> : null}
        {!isLoading && error ? (
          <ErrorState
            message={getErrorMessage(error, t('profile.loadError'))}
            onRetry={() => {
              void refetch();
            }}
          />
        ) : null}
        {!isLoading && data ? (
          <>
            <View style={styles.hero}>
              <Avatar name={fullName} size={56} />
              <View style={styles.heroText}>
                <Text style={styles.heroName}>{fullName}</Text>
                <Text style={styles.heroEmail}>{data.driver.email ?? data.user.email}</Text>
              </View>
            </View>

            <SectionHeader title={t('profile.account')} />
            <Card>
              <InfoRow label={t('profile.phone')} value={data.driver.phone ?? '—'} />
            </Card>

            <ListRow
              icon="bell"
              title={t('profile.notifications')}
              subtitle={t('notifications.subtitle')}
              onPress={() => router.push('/(app)/notifications')}
            />

            <ListRow
              icon="file-text"
              title={t('profile.openDocuments')}
              subtitle={t('profile.openDocumentsHint')}
              onPress={() => router.push('/(app)/documents')}
              showChevron
            />

            <SectionHeader title={t('profile.language')} />
            <Text style={styles.hint}>{t('profile.languageHint')}</Text>
            <View style={styles.languageRow}>
              {LANGUAGE_OPTIONS.map((item) => (
                <Pressable
                  key={item.code}
                  style={[
                    styles.languageChip,
                    data.user.language === item.code && styles.languageChipActive,
                  ]}
                  onPress={() => languageMutation.mutate(item.code)}
                  disabled={languageMutation.isPending}
                >
                  <Text
                    style={[
                      styles.languageText,
                      data.user.language === item.code && styles.languageTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <SectionHeader title={t('profile.location')} />
            <ListRow
              icon="navigation"
              title={t('profile.openTodayGps')}
              subtitle={t('profile.openTodayGpsHint')}
              onPress={() => router.push('/(app)/today')}
              showChevron
            />
            <LocationTrackingCard />
          </>
        ) : null}

        <ActionButton label={t('common.logout')} onPress={() => void handleLogout()} variant="danger" />
      </ScreenLayout>
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  heroText: { flex: 1, gap: 2 },
  heroName: { ...typography.h2 },
  heroEmail: { ...typography.caption, textTransform: 'none' },
  hint: {
    ...typography.caption,
    textTransform: 'none',
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  languageRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  languageChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.card,
  },
  languageChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  languageText: {
    color: colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  languageTextActive: {
    color: colors.accent,
  },
  infoRow: { gap: 2 },
  infoLabel: { ...typography.caption, textTransform: 'none' },
  infoValue: { ...typography.bodyMedium, color: colors.primary },
});
