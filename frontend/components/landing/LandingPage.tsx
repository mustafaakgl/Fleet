'use client';

import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  FileText,
  Fuel,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Truck,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CustomerLogos, TestimonialAvatar } from '@/components/landing/CustomerLogos';
import { HeroBackground } from '@/components/landing/HeroBackground';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { LiveTrackingSection } from '@/components/landing/LiveTrackingSection';
import { CompliancePreview } from '@/components/landing/previews/CompliancePreview';
import { DriverManagementPreview } from '@/components/landing/previews/DriverManagementPreview';
import { FleetDashboardPreview } from '@/components/landing/previews/FleetDashboardPreview';
import { PlanningPreview } from '@/components/landing/previews/PlanningPreview';

type PreviewType = 'planning' | 'compliance' | 'driver' | 'dashboard';

type SplitSection = {
  id: string;
  eyebrowKey: string;
  titleKey: string;
  descKey: string;
  ctaKey: string;
  bulletKeys?: string[];
  reverse?: boolean;
  preview: PreviewType;
};

export function LandingPage() {
  const { t } = useTranslation('landing');

  const platformFeatures = [
    { titleKey: 'solutions.tracking.title', descKey: 'solutions.tracking.desc', icon: MapPin, href: '#live-tracking' },
    { titleKey: 'solutions.fuel.title', descKey: 'solutions.fuel.desc', icon: Fuel, href: '#planning' },
    { titleKey: 'solutions.workflow.title', descKey: 'solutions.workflow.desc', icon: MessageSquare, href: '#planning' },
    { titleKey: 'solutions.routes.title', descKey: 'solutions.routes.desc', icon: CalendarDays, href: '#planning' },
    { titleKey: 'solutions.service.title', descKey: 'solutions.service.desc', icon: Truck, href: '#features' },
    { titleKey: 'solutions.compliant.title', descKey: 'solutions.compliant.desc', icon: ShieldCheck, href: '#compliance' },
  ];

  const featureCards: { titleKey: string; descKey: string; icon: LucideIcon }[] = [
    { titleKey: 'features.driver.title', descKey: 'features.driver.desc', icon: Users },
    { titleKey: 'features.vehicle.title', descKey: 'features.vehicle.desc', icon: Truck },
    { titleKey: 'features.documents.title', descKey: 'features.documents.desc', icon: FileText },
    { titleKey: 'features.tracking.title', descKey: 'features.tracking.desc', icon: MapPin },
    { titleKey: 'features.planning.title', descKey: 'features.planning.desc', icon: CalendarDays },
    { titleKey: 'features.compliance.title', descKey: 'features.compliance.desc', icon: ShieldCheck },
  ];

  const testimonials = [
    { quoteKey: 'testimonials.1.quote', nameKey: 'testimonials.1.name', companyKey: 'testimonials.1.company' },
    { quoteKey: 'testimonials.2.quote', nameKey: 'testimonials.2.name', companyKey: 'testimonials.2.company' },
    { quoteKey: 'testimonials.3.quote', nameKey: 'testimonials.3.name', companyKey: 'testimonials.3.company' },
  ];

  const splitSections: SplitSection[] = [
    {
      id: 'planning',
      eyebrowKey: 'split.planning.eyebrow',
      titleKey: 'split.planning.title',
      descKey: 'split.planning.desc',
      ctaKey: 'split.planning.cta',
      reverse: true,
      preview: 'planning',
    },
    {
      id: 'compliance',
      eyebrowKey: 'split.compliance.eyebrow',
      titleKey: 'split.compliance.title',
      descKey: 'split.compliance.desc',
      ctaKey: 'split.compliance.cta',
      bulletKeys: [
        'split.compliance.bullet1',
        'split.compliance.bullet2',
        'split.compliance.bullet3',
        'split.compliance.bullet4',
      ],
      preview: 'compliance',
    },
  ];

  const driverBullets = ['driver.bullet1', 'driver.bullet2', 'driver.bullet3', 'driver.bullet4', 'driver.bullet5'];

  const whyStats = [
    { value: '100+', labelKey: 'why.drivers' },
    { value: '50+', labelKey: 'why.vehicles' },
    { value: '99%', labelKey: 'why.documents' },
  ];

  function renderPreview(type: PreviewType) {
    switch (type) {
      case 'planning':
        return <PlanningPreview />;
      case 'compliance':
        return <CompliancePreview />;
      case 'driver':
        return <DriverManagementPreview />;
      case 'dashboard':
        return <FleetDashboardPreview />;
    }
  }

  return (
    <>
      <LandingHeader />

      <main className="bg-white">
        <section className="relative isolate flex min-h-[520px] items-center overflow-hidden text-white lg:min-h-[580px]">
          <HeroBackground variant="hero" />
          <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col justify-center px-6 py-20 lg:px-8 lg:py-24">
            <div className="w-full max-w-2xl">
              <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
                {t('hero.line1')}
                <br />
                {t('hero.line2')}
              </h1>
              <p className="mt-6 text-xl font-medium text-blue-100">{t('hero.tagline')}</p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-[#0066CC] px-8 py-3.5 text-base font-bold text-white shadow-lg transition hover:bg-[#0052a3]"
                >
                  {t('hero.ctaDemo')}
                </a>
                <a
                  href="#features"
                  className="inline-flex items-center justify-center rounded-full border-2 border-white/40 bg-white/10 px-8 py-3.5 text-base font-bold text-white backdrop-blur-sm transition hover:border-white/60 hover:bg-white/20"
                >
                  {t('hero.ctaFeatures')}
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="relative z-10 border-b border-slate-200 bg-slate-50 px-6 py-10 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <p className="text-center text-sm font-bold uppercase tracking-[0.2em] text-slate-500">
              {t('trust.title')}
            </p>
            <div className="mt-8">
              <CustomerLogos />
            </div>
          </div>
        </section>

        <section id="solutions" className="relative z-10 bg-white px-6 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-[#002B5C] sm:text-4xl">{t('solutions.title')}</h2>
              <p className="mt-4 text-lg text-slate-600">{t('solutions.subtitle')}</p>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {platformFeatures.map(({ titleKey, descKey, icon: Icon, href }) => (
                <a
                  key={titleKey}
                  href={href}
                  className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-6 transition hover:border-[#0066CC]/30 hover:shadow-lg hover:shadow-blue-950/5"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#0066CC] transition group-hover:bg-[#0066CC] group-hover:text-white">
                    <Icon className="h-5 w-5" aria-hidden />
                  </div>
                  <h3 className="mt-5 text-lg font-bold text-[#002B5C]">{t(titleKey)}</h3>
                  <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{t(descKey)}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#0066CC]">
                    {t('solutions.learnMore')}
                    <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section id="testimonials" className="bg-slate-50 px-6 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <h2 className="text-center text-3xl font-bold text-[#002B5C] sm:text-4xl">{t('testimonials.title')}</h2>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {testimonials.map(({ quoteKey, nameKey, companyKey }) => (
                <blockquote
                  key={nameKey}
                  className="flex flex-col rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
                >
                  <p className="flex-1 text-base leading-7 text-slate-700">&ldquo;{t(quoteKey)}&rdquo;</p>
                  <footer className="mt-6 flex items-center gap-4 border-t border-slate-100 pt-6">
                    <TestimonialAvatar name={t(nameKey)} />
                    <div>
                      <p className="font-bold text-[#002B5C]">{t(nameKey)}</p>
                      <p className="text-sm text-slate-500">{t(companyKey)}</p>
                    </div>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>

        <LiveTrackingSection />

        {splitSections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className={`px-6 py-20 lg:px-8 ${section.reverse ? 'bg-slate-50' : 'bg-white'}`}
          >
            <div
              className={`mx-auto flex max-w-7xl flex-col items-center gap-12 lg:flex-row lg:gap-16 ${
                section.reverse ? 'lg:flex-row-reverse' : ''
              }`}
            >
              <div className="w-full max-w-xl lg:flex-1">
                <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#0066CC]">
                  {t(section.eyebrowKey)}
                </p>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#002B5C] sm:text-4xl">
                  {t(section.titleKey)}
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">{t(section.descKey)}</p>

                {section.bulletKeys && (
                  <ul className="mt-8 space-y-3">
                    {section.bulletKeys.map((key) => (
                      <li key={key} className="flex items-center gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#0066CC]">
                          <Check className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="font-medium text-slate-800">{t(key)}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <a
                  href="/login"
                  className="mt-10 inline-flex items-center gap-2 rounded-full bg-[#0066CC] px-6 py-3 text-base font-bold text-white transition hover:bg-[#0052a3]"
                >
                  {t(section.ctaKey)}
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
              </div>

              <div className="w-full lg:flex-1">{renderPreview(section.preview)}</div>
            </div>
          </section>
        ))}

        <section id="driver-management" className="bg-slate-50 px-6 py-20 lg:px-8">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-12 lg:flex-row lg:gap-16">
            <div className="w-full max-w-xl lg:flex-1">
              <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#0066CC]">{t('driver.eyebrow')}</p>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#002B5C] sm:text-4xl lg:text-5xl">
                {t('driver.title')}
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-600">{t('driver.desc')}</p>

              <ul className="mt-8 space-y-4">
                {driverBullets.map((key) => (
                  <li key={key} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#0066CC]">
                      <Check className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="text-base font-medium text-slate-800">{t(key)}</span>
                  </li>
                ))}
              </ul>

              <a
                href="/login"
                className="mt-10 inline-flex items-center gap-2 rounded-full bg-[#0066CC] px-6 py-3 text-base font-bold text-white transition hover:bg-[#0052a3]"
              >
                {t('driver.cta')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>

            <div className="w-full lg:flex-1">
              <DriverManagementPreview />
            </div>
          </div>
        </section>

        <section id="features" className="px-6 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-[#002B5C] sm:text-4xl">{t('features.title')}</h2>
              <p className="mt-4 text-lg text-slate-600">{t('features.subtitle')}</p>
            </div>

            <div className="mt-14 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {featureCards.map(({ titleKey, descKey, icon: Icon }) => (
                <article
                  key={titleKey}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-[#0066CC]/30 hover:shadow-lg hover:shadow-blue-950/5"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#0066CC] transition group-hover:bg-[#0066CC] group-hover:text-white">
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <h3 className="mt-5 text-xl font-bold text-[#002B5C]">{t(titleKey)}</h3>
                  <p className="mt-2 text-base leading-7 text-slate-600">{t(descKey)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 overflow-hidden bg-[#002B5C] px-6 py-20 lg:px-8">
          <div className="relative mx-auto flex max-w-7xl flex-col items-center gap-10 lg:flex-row lg:gap-16">
            <div className="w-full max-w-xl text-white lg:flex-1">
              <h2 className="text-3xl font-bold sm:text-4xl">{t('savings.title')}</h2>
              <p className="mt-4 text-lg leading-8 text-blue-100">{t('savings.desc')}</p>
              <a
                href="/login"
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-base font-bold text-[#002B5C] transition hover:bg-blue-50"
              >
                {t('savings.cta')}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
            <div className="grid w-full flex-1 grid-cols-3 gap-4">
              {[
                ['-18%', t('savings.fuel')],
                ['-40%', t('savings.admin')],
                ['+99%', t('savings.compliance')],
              ].map(([value, label]) => (
                <div
                  key={label}
                  className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center backdrop-blur"
                >
                  <p className="text-3xl font-bold text-white">{value}</p>
                  <p className="mt-1 text-sm font-medium text-blue-200">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-20 lg:px-8">
          <div className="mx-auto max-w-7xl text-center">
            <h2 className="text-3xl font-bold text-[#002B5C] sm:text-4xl">{t('why.title')}</h2>
            <div className="mt-14 grid gap-8 sm:grid-cols-3">
              {whyStats.map(({ value, labelKey }) => (
                <div key={labelKey}>
                  <p className="text-5xl font-bold text-[#0066CC]">{value}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-600">{t(labelKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative z-10 overflow-hidden bg-[#002B5C] px-6 py-20 lg:px-8">
          <div className="relative mx-auto max-w-3xl text-center text-white">
            <h2 className="text-3xl font-bold sm:text-4xl">{t('cta.title')}</h2>
            <p className="mt-4 text-lg text-blue-100">{t('cta.desc')}</p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/login"
                className="inline-flex items-center justify-center rounded-full bg-[#0066CC] px-8 py-3.5 text-base font-bold text-white transition hover:bg-[#0052a3]"
              >
                {t('cta.demo')}
              </a>
              <a
                href="tel:+493012345678"
                className="inline-flex items-center justify-center rounded-full border-2 border-white/30 px-8 py-3.5 text-base font-bold text-white transition hover:border-white/60 hover:bg-white/10"
              >
                {t('cta.sales')}
              </a>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </>
  );
}
