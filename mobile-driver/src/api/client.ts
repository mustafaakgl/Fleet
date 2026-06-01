import axios from 'axios';
import { env } from '@/config/env';
import { authStore } from '@/features/auth/store';

export const apiClient = axios.create({
  baseURL: env.apiBaseUrl,
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  const token = authStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStore.getState().clearSession();
    }
    return Promise.reject(error);
  },
);
