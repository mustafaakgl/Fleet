import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { driverApi } from '@/api/endpoints';
import { storage } from '@/lib/storage';

export const PUSH_TOKEN_STORAGE_KEY = 'push_token_registration_status';

export type PushTokenRegistrationStatus = 'registered' | 'denied' | 'unsupported' | 'failed';

export async function getPushTokenRegistrationStatus(): Promise<PushTokenRegistrationStatus | null> {
  const value = await storage.getItem(PUSH_TOKEN_STORAGE_KEY);
  if (
    value === 'registered' ||
    value === 'denied' ||
    value === 'unsupported' ||
    value === 'failed'
  ) {
    return value;
  }
  return null;
}

async function setPushTokenRegistrationStatus(status: PushTokenRegistrationStatus) {
  await storage.setItem(PUSH_TOKEN_STORAGE_KEY, status);
}

export async function registerPushTokenAfterLogin(): Promise<PushTokenRegistrationStatus> {
  if (Platform.OS === 'web') {
    await setPushTokenRegistrationStatus('unsupported');
    return 'unsupported';
  }

  if (!Device.isDevice) {
    await setPushTokenRegistrationStatus('unsupported');
    return 'unsupported';
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      await setPushTokenRegistrationStatus('denied');
      return 'denied';
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      Constants.expoConfig?.slug;

    const tokenResult = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId: String(projectId) } : undefined,
    );

    await driverApi.registerPushToken(tokenResult.data);
    await setPushTokenRegistrationStatus('registered');
    return 'registered';
  } catch {
    await setPushTokenRegistrationStatus('failed');
    return 'failed';
  }
}
