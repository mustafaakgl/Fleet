import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { driverApi } from '@/api/endpoints';
import { storage } from '@/lib/storage';

export const PUSH_TOKEN_STORAGE_KEY = 'push_token_registration_status';
const PUSH_CHANNEL_ID = 'default';

export type PushTokenRegistrationStatus = 'registered' | 'denied' | 'unsupported' | 'failed';

export type PushRuntimeState = {
  registrationStatus: PushTokenRegistrationStatus;
  permissionStatus: Notifications.PermissionStatus | 'unsupported';
  active: boolean;
};

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

async function ensureDefaultAndroidChannel() {
  if (Platform.OS !== 'android') {
    return;
  }

  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0F2A46',
  });
}

function resolveProjectId(): string | null {
  const extraProjectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof extraProjectId === 'string' && extraProjectId.trim().length > 0 && !extraProjectId.startsWith('REPLACE_WITH_')) {
    return extraProjectId;
  }

  const easProjectId = Constants.easConfig?.projectId;
  if (typeof easProjectId === 'string' && easProjectId.trim().length > 0) {
    return easProjectId;
  }

  return null;
}

async function registerPushTokenWithGrantedPermission(): Promise<PushTokenRegistrationStatus> {
  await ensureDefaultAndroidChannel();

  const projectId = resolveProjectId();
  const tokenResult = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  await driverApi.registerPushToken(tokenResult.data);
  await setPushTokenRegistrationStatus('registered');
  return 'registered';
}

async function requestPermissionIfNeeded() {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') {
    return existingStatus;
  }
  const { status } = await Notifications.requestPermissionsAsync();
  return status;
}

function isNativeDevice() {
  return Platform.OS !== 'web' && Device.isDevice;
}

export async function ensurePushRuntimeConfigured() {
  if (!isNativeDevice()) {
    return;
  }
  await ensureDefaultAndroidChannel();
}

export async function registerPushTokenAfterLogin(): Promise<PushTokenRegistrationStatus> {
  if (!isNativeDevice()) {
    await setPushTokenRegistrationStatus('unsupported');
    return 'unsupported';
  }

  try {
    const finalStatus = await requestPermissionIfNeeded();
    if (finalStatus !== 'granted') {
      await setPushTokenRegistrationStatus('denied');
      return 'denied';
    }
    return registerPushTokenWithGrantedPermission();
  } catch {
    await setPushTokenRegistrationStatus('failed');
    return 'failed';
  }
}

export async function retryPushTokenRegistrationOnForeground(): Promise<PushTokenRegistrationStatus> {
  if (!isNativeDevice()) {
    await setPushTokenRegistrationStatus('unsupported');
    return 'unsupported';
  }

  const previous = (await getPushTokenRegistrationStatus()) ?? 'failed';
  if (previous === 'registered') {
    return 'registered';
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      if (status === 'denied') {
        await setPushTokenRegistrationStatus('denied');
        return 'denied';
      }
      return previous;
    }

    return registerPushTokenWithGrantedPermission();
  } catch {
    await setPushTokenRegistrationStatus('failed');
    return 'failed';
  }
}

export async function enablePushNotificationsFromProfile(): Promise<PushTokenRegistrationStatus> {
  return registerPushTokenAfterLogin();
}

export async function getPushRuntimeState(): Promise<PushRuntimeState> {
  if (!isNativeDevice()) {
    return {
      registrationStatus: 'unsupported',
      permissionStatus: 'unsupported',
      active: false,
    };
  }

  const registrationStatus = (await getPushTokenRegistrationStatus()) ?? 'failed';
  const permissions = await Notifications.getPermissionsAsync();

  return {
    registrationStatus,
    permissionStatus: permissions.status,
    active: registrationStatus === 'registered' && permissions.status === 'granted',
  };
}
