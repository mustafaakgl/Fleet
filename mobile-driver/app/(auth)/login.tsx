import { useState } from 'react';
import { router, Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi, driverApi } from '@/api/endpoints';
import { env } from '@/config/env';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { authStore } from '@/features/auth/store';
import { useTranslation } from '@/i18n/useTranslation';
import { registerPushTokenAfterLogin } from '@/lib/push-notifications';
import { colors, radius, shadows, spacing, typography } from '@/theme';
import { getErrorMessage } from '@/utils/errors';

export default function LoginScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const setSession = authStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailTrimmed = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed);
  const isPasswordValid = password.length >= 6;
  const isFormValid = isEmailValid && isPasswordValid;

  const onSubmit = async () => {
    if (!isFormValid) {
      setError(t('login.invalidEmail'));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      queryClient.clear();
      const login = await authApi.login(emailTrimmed, password);
      const driverProfile = await driverApi.me(login.accessToken);
      if (driverProfile.user.role !== 'driver') {
        setError(t('login.notDriver'));
        return;
      }
      await setSession({
        accessToken: login.accessToken,
        user: driverProfile.user,
        driver: driverProfile.driver,
      });
      void registerPushTokenAfterLogin();
      const docs = await driverApi.listDocuments().catch(() => null);
      if (docs && (docs.missingUploadableRequired?.length ?? docs.missingRequired.length) > 0) {
        router.replace('/(app)/document-onboarding');
      } else {
        router.replace('/(app)/today');
      }
    } catch (submitError) {
      const raw = getErrorMessage(submitError, t('login.failed'));
      if (raw === 'Cannot connect to Fleet ERP backend.') {
        setError(t('login.networkError'));
      } else if (raw === 'Invalid credentials') {
        setError(t('login.invalidCredentials'));
      } else if (
        raw.includes('No driver profile linked') ||
        raw.includes('Insufficient role')
      ) {
        setError(t('login.notDriver'));
      } else {
        setError(raw);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.hero}>
        <View style={styles.logoWrap}>
          <Text style={styles.logoText}>MyFleet</Text>
        </View>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
      </View>
      <View style={styles.card}>
        <TextField
          label={t('login.email')}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          placeholder="name@company.com"
        />
        {!isEmailValid && email.length > 0 ? (
          <Text style={styles.validation}>{t('login.invalidEmail')}</Text>
        ) : null}
        <TextField
          label={t('login.password')}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
        />
        {!isPasswordValid && password.length > 0 ? (
          <Text style={styles.validation}>{t('login.invalidPassword')}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={submitting ? t('login.signingIn') : t('login.signIn')}
          onPress={() => void onSubmit()}
          disabled={submitting || !isFormValid}
          loading={submitting}
          variant="primary"
        />
        {__DEV__ ? (
          <View style={styles.devHints}>
            <Text style={styles.devHint}>{t('login.devApiHint', { url: env.apiBaseUrl })}</Text>
            <Text style={styles.devHint}>{t('login.devCredentialsHint')}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logoWrap: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    ...shadows.md,
  },
  logoText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  title: { ...typography.h1, textAlign: 'center' },
  subtitle: { ...typography.caption, textAlign: 'center', textTransform: 'none', fontSize: 14 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.sm,
  },
  validation: { color: colors.warning, fontSize: 12 },
  error: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  devHints: { marginTop: spacing.sm, gap: 4 },
  devHint: { color: colors.muted, fontSize: 11, textAlign: 'center' },
});
