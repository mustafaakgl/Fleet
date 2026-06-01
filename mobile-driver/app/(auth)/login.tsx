import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ScreenLayout } from '@/components/ScreenLayout';
import { authApi, driverApi } from '@/api/endpoints';
import { authStore } from '@/features/auth/store';
import { getErrorMessage } from '@/utils/errors';

export default function LoginScreen() {
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
      setError('Enter a valid email and password (min 6 chars).');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const login = await authApi.login(emailTrimmed, password);
      const driverProfile = await driverApi.me();
      await setSession({
        accessToken: login.accessToken,
        user: driverProfile.user,
        driver: driverProfile.driver,
      });
      router.replace('/(app)/today');
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Login failed. Please check your credentials.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenLayout title="Driver Login" subtitle="Sign in to Fleet Driver App">
      <View style={styles.form}>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
        />
        {!isEmailValid && email.length > 0 ? <Text style={styles.validation}>Please enter a valid email.</Text> : null}
        <TextInput
          secureTextEntry
          placeholder="Password"
          style={styles.input}
          value={password}
          onChangeText={setPassword}
        />
        {!isPasswordValid && password.length > 0 ? <Text style={styles.validation}>Password must be at least 6 characters.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable
          style={[styles.button, (submitting || !isFormValid) && styles.buttonDisabled]}
          onPress={() => void onSubmit()}
          disabled={submitting || !isFormValid}
        >
          <Text style={styles.buttonText}>{submitting ? 'Signing in...' : 'Sign In'}</Text>
        </Pressable>
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#B91C1C',
    fontSize: 13,
  },
  validation: {
    color: '#92400E',
    fontSize: 12,
  },
});
