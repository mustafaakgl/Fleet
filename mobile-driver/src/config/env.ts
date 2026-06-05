import Constants from 'expo-constants';
import { Platform } from 'react-native';

type ExpoExtra = {
  apiBaseUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
const hostUri = Constants.expoConfig?.hostUri;

const API_PORT = 3000;
const API_PATH = '/api/v1';

function isLoopbackHost(host: string) {
  return host === 'localhost' || host === '127.0.0.1';
}

function isLoopbackUrl(url: string) {
  try {
    return isLoopbackHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

function apiUrlForHost(host: string) {
  return `http://${host}:${API_PORT}${API_PATH}`;
}

/** Host from Expo Metro (e.g. 192.168.1.5:8081) — same machine as the Nest backend in dev. */
function hostFromExpo(): string | null {
  if (!hostUri) {
    return null;
  }
  const host = hostUri.split(':')[0]?.trim();
  if (!host || isLoopbackHost(host)) {
    return null;
  }
  return host;
}

function resolveRuntimeApiBaseUrl(): string {
  const expoHost = hostFromExpo();
  if (expoHost) {
    return apiUrlForHost(expoHost);
  }
  if (Platform.OS === 'android') {
    return apiUrlForHost('10.0.2.2');
  }
  return apiUrlForHost('localhost');
}

function resolveApiBaseUrl(): string {
  const configured = extra.apiBaseUrl?.trim();
  if (configured && !isLoopbackUrl(configured)) {
    return configured;
  }
  const runtime = resolveRuntimeApiBaseUrl();
  if (configured && isLoopbackUrl(configured)) {
    return runtime;
  }
  return runtime;
}

export const env = {
  apiBaseUrl: resolveApiBaseUrl(),
};
