'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, Menu, Phone, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { LanguageSwitcher } from '@/components/landing/LanguageSwitcher';

type MegaColumn = {
  titleKey: string;
  links: { labelKey: string; href: string }[];
};

type MegaMenu = {
  id: string;
  labelKey: string;
  columns: MegaColumn[];
};

const megaMenus: MegaMenu[] = [
  {
    id: 'solutions',
    labelKey: 'nav.solutions',
    columns: [
      {
        titleKey: 'mega.fleetManagement',
        links: [
          { labelKey: 'mega.fleetTracking', href: '#live-tracking' },
          { labelKey: 'mega.driverManagement', href: '#driver-management' },
          { labelKey: 'mega.vehicleManagement', href: '#features' },
          { labelKey: 'mega.planning', href: '#planning' },
        ],
      },
      {
        titleKey: 'mega.workflow',
        links: [
          { labelKey: 'mega.messenger', href: '#features' },
          { labelKey: 'mega.documents', href: '#compliance' },
          { labelKey: 'mega.compliance', href: '#compliance' },
          { labelKey: 'mega.safety', href: '#features' },
        ],
      },
      {
        titleKey: 'mega.maintenance',
        links: [
          { labelKey: 'mega.vehicleManagement', href: '#features' },
          { labelKey: 'mega.maintenance', href: '#features' },
        ],
      },
    ],
  },
  {
    id: 'technology',
    labelKey: 'nav.technology',
    columns: [
      {
        titleKey: 'nav.technology',
        links: [
          { labelKey: 'mega.platform', href: '#features' },
          { labelKey: 'mega.mobileApp', href: '#features' },
          { labelKey: 'mega.officeDashboard', href: '#features' },
          { labelKey: 'mega.liveTracking', href: '#live-tracking' },
        ],
      },
      {
        titleKey: 'mega.integrations',
        links: [
          { labelKey: 'mega.integrations', href: '#features' },
          { labelKey: 'mega.api', href: '#contact' },
        ],
      },
    ],
  },
  {
    id: 'industries',
    labelKey: 'nav.industries',
    columns: [
      {
        titleKey: 'nav.industries',
        links: [
          { labelKey: 'mega.transport', href: '#solutions' },
          { labelKey: 'mega.courier', href: '#solutions' },
          { labelKey: 'mega.construction', href: '#solutions' },
          { labelKey: 'mega.salesFleet', href: '#solutions' },
          { labelKey: 'mega.coldChain', href: '#solutions' },
          { labelKey: 'mega.passenger', href: '#solutions' },
        ],
      },
    ],
  },
  {
    id: 'resources',
    labelKey: 'nav.resources',
    columns: [
      {
        titleKey: 'nav.resources',
        links: [
          { labelKey: 'mega.blog', href: '#contact' },
          { labelKey: 'mega.caseStudies', href: '#testimonials' },
          { labelKey: 'mega.webinars', href: '#contact' },
          { labelKey: 'mega.helpCenter', href: '#contact' },
          { labelKey: 'mega.glossary', href: '#contact' },
        ],
      },
    ],
  },
];

const simpleLinks = [
  { labelKey: 'nav.customers', href: '#testimonials' },
  { labelKey: 'nav.contact', href: '#contact' },
];

export function LandingHeader() {
  const { t } = useTranslation('landing');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [openMega, setOpenMega] = useState<string | null>(null);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
        <MyFleetLogo height={40} priority />

        <nav className="hidden items-center gap-0.5 lg:flex">
          {megaMenus.map((menu) => (
            <div
              key={menu.id}
              className="relative"
              onMouseEnter={() => setOpenMega(menu.id)}
              onMouseLeave={() => setOpenMega(null)}
            >
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-[#002B5C]"
              >
                {t(menu.labelKey)}
                <ChevronDown className="h-4 w-4" />
              </button>

              {openMega === menu.id && (
                <div className="absolute left-1/2 top-full z-50 w-[640px] -translate-x-1/2 pt-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
                    <div
                      className={`grid gap-8 ${
                        menu.columns.length >= 3
                          ? 'grid-cols-1 sm:grid-cols-3'
                          : menu.columns.length === 2
                            ? 'grid-cols-1 sm:grid-cols-2'
                            : 'grid-cols-1'
                      }`}
                    >
                      {menu.columns.map((col) => (
                        <div key={col.titleKey}>
                          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">
                            {t(col.titleKey)}
                          </p>
                          <ul className="space-y-1">
                            {col.links.map((link) => (
                              <li key={link.labelKey + link.href}>
                                <a
                                  href={link.href}
                                  className="block rounded-lg px-2 py-2 text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-[#0066CC]"
                                >
                                  {t(link.labelKey)}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {simpleLinks.map((link) => (
            <a
              key={link.labelKey}
              href={link.href}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:text-[#002B5C]"
            >
              {t(link.labelKey)}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher />
          <a
            href="tel:+493012345678"
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 transition hover:text-[#002B5C]"
          >
            <Phone className="h-4 w-4" />
            +49 30 1234 5678
          </a>
          <Link
            href="/login"
            className="rounded-full bg-[#0066CC] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#0052a3]"
          >
            {t('nav.requestDemo')}
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher />
          <button
            type="button"
            className="rounded-lg p-2 text-slate-700"
            onClick={() => setMobileOpen((open) => !open)}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="max-h-[80vh] overflow-y-auto border-t border-slate-200 bg-white px-6 py-4 lg:hidden">
          <nav className="flex flex-col gap-4">
            {megaMenus.map((menu) => (
              <div key={menu.id}>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  {t(menu.labelKey)}
                </p>
                <div className="flex flex-col gap-0.5">
                  {menu.columns.flatMap((col) =>
                    col.links.map((link) => (
                      <a
                        key={link.labelKey + link.href}
                        href={link.href}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => setMobileOpen(false)}
                      >
                        {t(link.labelKey)}
                      </a>
                    )),
                  )}
                </div>
              </div>
            ))}
            {simpleLinks.map((link) => (
              <a
                key={link.labelKey}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setMobileOpen(false)}
              >
                {t(link.labelKey)}
              </a>
            ))}
            <Link
              href="/login"
              className="mt-2 rounded-full bg-[#0066CC] px-5 py-3 text-center text-sm font-bold text-white"
              onClick={() => setMobileOpen(false)}
            >
              {t('nav.requestDemo')}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
