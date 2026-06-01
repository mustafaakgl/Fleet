import Constants from 'expo-constants';

type ExpoExtra = {
  apiBaseUrl?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;

export const env = {
  apiBaseUrl: extra.apiBaseUrl ?? 'http://localhost:3000/api/v1',
};
