'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { MyFleetLogo } from '@/components/brand/MyFleetLogo';
import { LOGIN_HREF, TRIAL_CTA_LABEL, TRIAL_CTA_LINK } from './marketing-config';

const navLinks = [
  { label: 'Funktionen', href: '/#funktionen' },
  { label: 'Preise', href: '/#preise' },
  { label: 'Kostenlose Tools', href: '/#tools' },
  { label: 'FAQ', href: '/#faq' },
];

export function MarketingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="m-nav">
      <div className="m-wrap m-nav-inner">
        <MyFleetLogo height={36} priority />

        <div className="m-nav-links">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <Link href={LOGIN_HREF} className="m-nav-login">
            Anmelden
          </Link>
          <Link href={TRIAL_CTA_LINK} className="m-btn m-btn-primary" data-track="header-trial-cta">
            Kostenlos testen
          </Link>
        </div>

        <button
          type="button"
          className="m-nav-toggle"
          onClick={() => setMobileOpen((open) => !open)}
          aria-label={mobileOpen ? 'Menü schließen' : 'Menü öffnen'}
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="m-nav-mobile">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>
              {link.label}
            </Link>
          ))}
          <Link href={LOGIN_HREF} onClick={() => setMobileOpen(false)}>
            Anmelden
          </Link>
          <Link
            href={TRIAL_CTA_LINK}
            className="m-btn m-btn-primary"
            style={{ textAlign: 'center', marginTop: 8 }}
            onClick={() => setMobileOpen(false)}
          >
            {TRIAL_CTA_LABEL}
          </Link>
        </div>
      )}
    </nav>
  );
}
