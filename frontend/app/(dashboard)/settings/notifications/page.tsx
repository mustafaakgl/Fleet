'use client';

import { Bell } from 'lucide-react';
import { SettingsPlaceholder } from '@/components/settings/SettingsPlaceholder';

export default function SettingsNotificationsPage() {
  return <SettingsPlaceholder icon={Bell} titleKey="accountMenu.notificationSettings" />;
}
