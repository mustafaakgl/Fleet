import Constants from 'expo-constants';

type ExpoExtra = {
  apiBaseUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
const hostUri = Constants.expoConfig?.hostUri;

function resolveDefaultApiBaseUrl() {
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) {
      return `http://${host}:3000/api/v1`;
    }
  }
  return 'http://localhost:3000/api/v1';
}

export const env = {
  apiBaseUrl: extra.apiBaseUrl ?? resolveDefaultApiBaseUrl(),
};
