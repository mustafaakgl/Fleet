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
  title: 'Funktionen — MyFleet Fuhrpark-Software für Speditionen',
  description:
    'Fristen, Dokumente, Fahrer-App, Abfahrtskontrolle, Mängel und mehrsprachige Kommunikation — alles für LKW-Flotten in einer Plattform.',
};

const modules = [
  { icon: '🛡️', title: 'Compliance & Fristen', desc: 'HU, SP, UVV, Führerschein — automatische Erinnerungen 3 Monate, 1 Monat und 1 Woche vorher.' },
  { icon: '📄', title: 'Dokumentenmanagement', desc: 'Fahrer fotografiert, System ordnet zu. Schadenberichte, Unfallakten, Bußgelder — alles am Fahrzeug.' },
  { icon: '🌍', title: 'Mehrsprachige Fahrer-App', desc: '8 Sprachen: TR, PL, EN, DE, FR, IT, ES, NL. Jeder schreibt in seiner Sprache, jeder liest in seiner.' },
  { icon: '🚛', title: 'Abfahrtskontrolle & Mängel', desc: 'Digitale Checkliste vor jeder Tour. Mangel gemeldet → Werkstatt → Fahrer bestätigt.' },
  { icon: '👤', title: 'Fahrerverwaltung', desc: 'Einladung per Link, Onboarding in Minuten. Führerschein-Fotos, Dokumente, Schichtstatus.' },
  { icon: '📅', title: 'Einsatzplan & Zuweisungen', desc: 'Fahrer-Fahrzeug-Zuordnung, Schichten, Verfügbarkeit — Büro sieht alles auf einen Blick.' },
];

export default function FunktionenPage() {
  return (
    <div className={`marketing-landing ${inter.variable} ${ibmPlexMono.variable}`}>
      <MarketingHeader />
      <main className="m-section">
        <div className="m-wrap">
          <span className="m-eyebrow">Für den Alltag gebaut</span>
          <h1 className="m-h2">Funktionen</h1>
          <p className="m-sub">Alles, was eine Spedition braucht — ohne Telematik-Hardware und ohne Dienstwagen-Ballast.</p>

          <div className="m-karten">
            {modules.map((mod) => (
              <article key={mod.title} className="m-karte">
                <div className="m-icon">{mod.icon}</div>
                <div className="m-frage">{mod.title}</div>
                <p>{mod.desc}</p>
              </article>
            ))}
          </div>

          <div style={{ textAlign: 'center', marginTop: 48 }}>
            <Link href={TRIAL_CTA_LINK} className="m-btn m-btn-primary">
              {TRIAL_CTA_LABEL}
            </Link>
            <p className="m-tool-links" style={{ marginTop: 16 }}>
              Oder zuerst: <Link href="/tools/bussgeld-rechner">Bußgeld-Risikorechner</Link>
            </p>
          </div>
        </div>
      </main>
      <MarketingFooter />
      <WhatsAppButton />
    </div>
  );
}
