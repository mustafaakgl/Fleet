'use client';

import Image from 'next/image';
import { useTranslation } from 'react-i18next';
import { LOGIN_HREF } from '@/components/landing/marketing/marketing-config';

export function LiveTrackingSection() {
  const { t } = useTranslation('landing');

  return (
    <section id="live-tracking" className="relative z-10 bg-slate-100 px-6 py-20 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="w-full max-w-xl lg:flex-1">
          <h2 className="text-3xl font-bold leading-tight tracking-tight text-brand-primary sm:text-4xl lg:text-[2.5rem] lg:leading-[1.15]">
            {t('split.liveTracking.title')}
          </h2>
          <p className="mt-6 text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">
            {t('split.liveTracking.desc')}
          </p>
          <a
            href={LOGIN_HREF}
            className="mt-10 inline-flex items-center justify-center rounded-md border border-slate-300 bg-slate-200/80 px-6 py-3 text-base font-semibold text-brand-primary transition hover:border-slate-400 hover:bg-slate-200"
          >
            {t('split.liveTracking.cta')}
          </a>
        </div>

        <div className="w-full lg:flex-1">
          <Image
            src="/live-tracking-devices.png"
            alt={t('split.liveTracking.imageAlt')}
            width={1024}
            height={332}
            className="h-auto w-full max-w-2xl object-contain lg:ml-auto lg:max-w-none"
            sizes="(max-width: 1024px) 100vw, 50vw"
          />
        </div>
      </div>
    </section>
  );
}
