'use client';

import Link from 'next/link';
import { CircleHelp, Clock, Mail, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const FAQ_SECTIONS = [
  {
    titleKey: 'help.faq.billing.title',
    items: [
      { q: 'help.faq.billing.q1', a: 'help.faq.billing.a1' },
      { q: 'help.faq.billing.q2', a: 'help.faq.billing.a2' },
      { q: 'help.faq.billing.q3', a: 'help.faq.billing.a3' },
    ],
  },
  {
    titleKey: 'help.faq.onboarding.title',
    items: [
      { q: 'help.faq.onboarding.q1', a: 'help.faq.onboarding.a1' },
      { q: 'help.faq.onboarding.q2', a: 'help.faq.onboarding.a2' },
    ],
  },
  {
    titleKey: 'help.faq.privacy.title',
    items: [
      { q: 'help.faq.privacy.q1', a: 'help.faq.privacy.a1' },
      { q: 'help.faq.privacy.q2', a: 'help.faq.privacy.a2' },
    ],
  },
  {
    titleKey: 'help.faq.technical.title',
    items: [
      { q: 'help.faq.technical.q1', a: 'help.faq.technical.a1' },
      { q: 'help.faq.technical.q2', a: 'help.faq.technical.a2' },
    ],
  },
] as const;

export default function HilfePage() {
  const { t } = useTranslation();

  const supportEmail =
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || 'support@myfleet.app';
  const supportHours =
    process.env.NEXT_PUBLIC_SUPPORT_HOURS?.trim() || t('help.supportHoursDefault');

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-blue-100 p-3">
          <CircleHelp className="h-6 w-6 text-blue-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('help.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('help.subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            {t('help.contactTitle')}
          </CardTitle>
          <CardDescription>{t('help.contactSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-slate-500" />
            <a href={`mailto:${supportEmail}`} className="font-medium text-blue-700 hover:underline">
              {supportEmail}
            </a>
          </p>
          <p className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            {supportHours}
          </p>
          <p>{t('help.responseSla')}</p>
        </CardContent>
      </Card>

      {FAQ_SECTIONS.map((section) => (
        <Card key={section.titleKey}>
          <CardHeader>
            <CardTitle>{t(section.titleKey)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {section.items.map((item) => (
              <div key={item.q} className="border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                <p className="font-medium text-slate-900">{t(item.q)}</p>
                <p className="mt-1 text-sm text-slate-600">{t(item.a)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{t('help.linksTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <Link href="/getting-started" className="text-blue-700 hover:underline">
              {t('nav.gettingStarted')}
            </Link>
          </p>
          <p>
            <Link href="/billing" className="text-blue-700 hover:underline">
              {t('nav.billing')}
            </Link>
          </p>
          <p>
            <Link href="/privacy" className="text-blue-700 hover:underline">
              {t('nav.privacy')}
            </Link>
          </p>
          <p>
            <Link href="/import" className="text-blue-700 hover:underline">
              {t('nav.import')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
