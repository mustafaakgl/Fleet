import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { MarketingFooter } from './MarketingFooter';
import { MarketingHeader } from './MarketingHeader';
import { TRIAL_CTA_HREF, TRIAL_CTA_LABEL } from './marketing-config';
import { WhatsAppButton } from './WhatsAppButton';

type ToolPageLayoutProps = {
  children: ReactNode;
};

export function ToolPageLayout({ children }: ToolPageLayoutProps) {
  return (
    <>
      <MarketingHeader />
      <div className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl items-center px-6 py-3 lg:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-brand-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Zur Startseite
          </Link>
        </div>
      </div>
      {children}
      <section className="bg-brand-primary px-6 py-16 text-white lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">Fristen automatisch im Griff?</h2>
          <p className="mt-4 text-lg text-blue-100">
            MyFleet erinnert 3 Monate, 1 Monat und 1 Woche vor jeder HU, SP und UVV — ohne Zettelchaos.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={TRIAL_CTA_HREF}
              data-track="tool-footer-trial-cta"
              className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-8 py-3.5 text-base font-bold text-white transition hover:bg-brand-primary"
            >
              {TRIAL_CTA_LABEL}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link href="/preise" className="text-sm font-semibold text-blue-200 hover:text-white">
              Preise ansehen →
            </Link>
          </div>
        </div>
      </section>
      <MarketingFooter />
      <WhatsAppButton />
    </>
  );
}
