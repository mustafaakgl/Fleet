import type { Metadata } from 'next';
import Link from 'next/link';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import { MarketingFooter } from '@/components/landing/marketing/MarketingFooter';
import { MarketingHeader } from '@/components/landing/marketing/MarketingHeader';
import { WhatsAppButton } from '@/components/landing/marketing/WhatsAppButton';
import { TRIAL_CTA_LABEL, TRIAL_CTA_LINK } from '@/components/landing/marketing/marketing-config';
import '@/components/landing/marketing/marketing-landing.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-marketing-inter' });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-marketing-mono' });

export const metadata: Metadata = {
  title: 'Preise — MyFleet Fuhrpark-Software',
  description:
    'Transparente Preise für Speditionsflotten: 149–499 €/Monat, alle Funktionen inklusive. Keine Hardware, keine Kosten pro Fahrer, monatlich kündbar.',
};

const tiers = [
  { range: 'Bis 20 Fahrzeuge', price: '149', ideal: 'Kleine Spedition, regionale Zustellung', popular: false },
  { range: '21 – 50 Fahrzeuge', price: '299', ideal: 'Mittlere Flotte, mehrere Standorte', popular: true },
  { range: '51 – 100 Fahrzeuge', price: '499', ideal: 'Größere LKW-Flotte mit Compliance-Fokus', popular: false },
];

const included = [
  'Fristenüberwachung (HU, SP, UVV, Führerschein)',
  'Dokumentenmanagement & Fahrer-Uploads',
  'Mehrsprachige Fahrer-App (8 Sprachen)',
  'Abfahrtskontrolle & Mängelmanagement',
  'Büro-Dashboard & Excel-Import',
  'DSGVO-konforme Schicht-Ortung',
  'E-Mail-Support & Onboarding-Hilfe',
];

export default function PreisePage() {
  return (
    <div className={`marketing-landing ${inter.variable} ${ibmPlexMono.variable}`}>
      <MarketingHeader />
      <main className="m-section">
        <div className="m-wrap">
          <span className="m-eyebrow">Transparent &amp; planbar</span>
          <h1 className="m-h2">Preise</h1>
          <p className="m-sub">Ein Preis pro Flottengröße. Alle Funktionen inklusive — keine Überraschungen auf der Rechnung.</p>

          <div className="m-preise-grid">
            {tiers.map((tier) => (
              <article key={tier.range} className={`m-preis${tier.popular ? ' m-preis-beliebt' : ''}`}>
                {tier.popular ? <div className="m-tag">Am beliebtesten</div> : null}
                <div className="m-gruppe">{tier.range}</div>
                <div className="m-betrag">
                  {tier.price} €<small> /Monat</small>
                </div>
                <p style={{ fontSize: 14, color: 'var(--grau)', marginTop: 8 }}>{tier.ideal}</p>
                <ul>
                  <li>Alle Funktionen</li>
                  <li>Unbegrenzte Fahrer</li>
                  <li>Monatlich kündbar</li>
                </ul>
                <Link href={TRIAL_CTA_LINK} className={`m-btn ${tier.popular ? 'm-btn-primary' : 'm-btn-ghost'}`}>
                  Kostenlos testen
                </Link>
              </article>
            ))}
          </div>

          <div style={{ maxWidth: 640, margin: '48px auto 0' }}>
            <h2 className="m-h2" style={{ fontSize: 24, textAlign: 'center' }}>
              Immer inklusive
            </h2>
            <ul style={{ marginTop: 24, display: 'grid', gap: 10 }}>
              {included.map((item) => (
                <li key={item} style={{ fontSize: 15, color: 'var(--tinte)', paddingLeft: 24, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: 'var(--gruen)', fontWeight: 700 }}>✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <p className="m-alle-inkl" style={{ marginTop: 32 }}>
              Flotten über 100 Fahrzeuge?{' '}
              <a href="mailto:vertrieb@myfleet.de" style={{ color: 'var(--blau)', fontWeight: 600 }}>
                Individuelles Angebot anfragen
              </a>
            </p>
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <Link href={TRIAL_CTA_LINK} className="m-btn m-btn-primary">
                {TRIAL_CTA_LABEL}
              </Link>
            </div>
          </div>
        </div>
      </main>
      <MarketingFooter />
      <WhatsAppButton />
    </div>
  );
}
