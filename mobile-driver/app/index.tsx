import { Redirect } from 'expo-router';
import { authStore } from '@/features/auth/store';

export default function IndexScreen() {
  const accessToken = authStore((s) => s.accessToken);
  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }
  return <Redirect href="/(app)/today" />;
}
