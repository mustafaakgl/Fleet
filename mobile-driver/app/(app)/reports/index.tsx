import { Stack } from 'expo-router';
import { ScreenLayout } from '@/components/ScreenLayout';
import { DriverReportsPanel } from '@/components/DriverReportsPanel';
import { useTranslation } from '@/i18n/useTranslation';

export default function ReportsScreen() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenLayout title={t('reports.pageTitle')} subtitle={t('reports.pageSubtitle')}>
        <DriverReportsPanel />
      </ScreenLayout>
    </>
  );
}
