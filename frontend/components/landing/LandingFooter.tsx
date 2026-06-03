'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';

export function LandingFooter() {
  const { t } = useTranslation('landing');

  const footerColumns = [
    {
      titleKey: 'footer.products',
      links: [
        'mega.fleetManagement',
        'mega.liveTracking',
        'mega.driverManagement',
        'mega.vehicleManagement',
        'mega.planning',
        'mega.compliance',
      ],
    },
    {
      titleKey: 'footer.technology',
      links: ['mega.platform', 'mega.mobileApp', 'mega.officeDashboard', 'mega.messenger', 'mega.documents'],
    },
    {
      titleKey: 'footer.industries',
      links: [
        'mega.transport',
        'mega.courier',
        'mega.construction',
        'mega.salesFleet',
        'mega.coldChain',
        'mega.passenger',
      ],
    },
    {
      titleKey: 'footer.resources',
      links: ['mega.blog', 'mega.caseStudies', 'mega.webinars', 'mega.helpCenter', 'mega.glossary'],
    },
  ];

  return (
    <footer id="contact" className="bg-[#002B5C] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-1">
            <MyFleetLogo height={48} onDark />
            <p className="mt-4 text-sm leading-6 text-blue-100">{t('footer.tagline')}</p>
          </div>

          {footerColumns.map((column) => (
            <div key={column.titleKey}>
              <h3 className="text-sm font-bold uppercase tracking-wider text-blue-200">
                {t(column.titleKey)}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {column.links.map((linkKey) => (
                  <li key={linkKey}>
                    <span className="cursor-default text-sm text-blue-100/90 transition hover:text-white">
                      {t(linkKey)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-sm text-blue-200">
            © {new Date().getFullYear()} MyFleet. {t('footer.rights')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-blue-200">
            <span>{t('footer.privacy')}</span>
            <span>{t('footer.terms')}</span>
            <span>{t('footer.imprint')}</span>
            <Link href="/login" className="font-semibold text-white transition hover:text-blue-200">
              {t('nav.signIn')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
