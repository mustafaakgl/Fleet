import AsyncStorage from '@react-native-async-storage/async-storage';
import { localTodayDate } from '@/lib/calendar-date';

const FEIERABEND_DATE_KEY = 'driver_feierabend_date';

export async function isFeierabendPausedToday(): Promise<boolean> {
  const stored = await AsyncStorage.getItem(FEIERABEND_DATE_KEY);
  return stored === localTodayDate();
}

export async function markFeierabendToday(): Promise<void> {
  await AsyncStorage.setItem(FEIERABEND_DATE_KEY, localTodayDate());
}

export async function clearFeierabendPause(): Promise<void> {
  await AsyncStorage.removeItem(FEIERABEND_DATE_KEY);
}
