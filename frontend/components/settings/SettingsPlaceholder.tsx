'use client';

import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';

type SettingsPlaceholderProps = {
  icon: LucideIcon;
  titleKey: string;
  subtitleKey?: string;
};

export function SettingsPlaceholder({ icon, titleKey, subtitleKey }: SettingsPlaceholderProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={icon}
        title={t(titleKey)}
        subtitle={subtitleKey ? t(subtitleKey) : t('settings.placeholderSubtitle')}
      />
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-500">
          {t('settings.placeholderBody')}
        </CardContent>
      </Card>
    </div>
  );
}
