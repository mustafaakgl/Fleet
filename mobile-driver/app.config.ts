import type { ExpoConfig, ConfigContext } from 'expo/config';
import appJson from './app.json';

type ExtraConfig = {
  apiBaseUrl?: string;
  eas?: {
    projectId?: string;
  };
};

const baseConfig = appJson.expo as ExpoConfig & { extra?: ExtraConfig };

function resolveApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return baseConfig.extra?.apiBaseUrl ?? 'http://localhost:3000/api/v1';
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ...baseConfig,
  extra: {
    ...baseConfig.extra,
    apiBaseUrl: resolveApiBaseUrl(),
    eas: {
      projectId: baseConfig.extra?.eas?.projectId ?? 'REPLACE_WITH_EAS_PROJECT_ID',
    },
  },
});
