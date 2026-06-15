'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { IBM_Plex_Mono, Inter } from 'next/font/google';
import { HeroScrollIndicator } from './HeroScrollIndicator';
import { ProductTour } from './ProductTour';
import { MarketingFooter } from './MarketingFooter';
import { MarketingHeader } from './MarketingHeader';
import { TrustStrip } from './TrustStrip';
import { WhatsAppButton } from './WhatsAppButton';
import { TrialForm } from './TrialForm';
import {
  TRIAL_CTA_LABEL,
  TRIAL_CTA_LINK,
  faqItems,
  partnerStory,
  whatsAppHref,
} from './marketing-config';
import './marketing-landing.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-marketing-inter' });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-marketing-mono',
});

const problemCards = [
  {
    icon: '⏰',
    title: '„Wieder eine HU verpasst?"',
    body: 'Automatische Fristenverwaltung für TÜV, SP, UVV und Führerscheine. Warnung 3 Monate, 1 Monat und 1 Woche vorher — an Sie und den Fahrer.',
  },
  {
    icon: '💬',
    title: '„Ihr Fahrer spricht kein Deutsch?"',
    body: 'Jeder schreibt in seiner Sprache, jeder liest in seiner Sprache. Automatisch übersetzt, ohne Missverständnisse.',
    flags: '🇩🇪 🇵🇱 🇹🇷 🇬🇧 🇫🇷 🇮🇹 🇪🇸 🇳🇱',
  },
  {
    icon: '📄',
    title: '„Wo ist der Schadenbericht?"',
    body: 'Fahrer fotografiert, System ordnet zu: Unfallakte, Lieferscheine, Prüfberichte — alles am richtigen Fahrzeug, nichts mehr im Handschuhfach.',
  },
];

const steps = [
  {
    title: 'Fahrzeuge importieren',
    desc: 'Excel-Liste hochladen — fertig. Kein Techniker, keine Werkstatt, keine Hardware.',
  },
  {
    title: 'Fahrer einladen',
    desc: 'Ein Link per SMS genügt. Die App stellt sich automatisch auf die Sprache des Fahrers ein.',
  },
  {
    title: 'Zurücklehnen',
    desc: 'Fristen, Dokumente und Meldungen laufen ab sofort automatisch. Sie sehen alles in einem Dashboard.',
  },
];

const pricingTiers = [
  { range: 'Bis 20 Fahrzeuge', price: '149', perVehicle: 'ab 7,45 € pro Fahrzeug', popular: false },
  { range: '21 – 50 Fahrzeuge', price: '299', perVehicle: 'ab 5,98 € pro Fahrzeug', popular: true },
  { range: '51 – 100 Fahrzeuge', price: '499', perVehicle: 'ab 4,99 € pro Fahrzeug', popular: false },
];

const compareRows = [
  ['Hardware nötig?', 'Nein', 'Ja, pro Fahrzeug'],
  ['Vertragslaufzeit', 'Monatlich', '24–36 Monate'],
  ['Mehrsprachige Fahrer-App', '8 Sprachen', 'Selten'],
  ['Kosten pro Fahrer', '0 €', 'Oft extra'],
  ['Fristen & Dokumente', 'Kernfunktion', 'Zusatzmodul'],
];

export function HomeLandingPage() {
  const partner = partnerStory();

  useEffect(() => {
    const els = document.querySelectorAll('.marketing-landing [data-reveal]');
    if (typeof IntersectionObserver === 'undefined') {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className={`marketing-landing ${inter.variable} ${ibmPlexMono.variable}`}>
      <MarketingHeader />

      <header className="m-hero">
        <div className="m-wrap m-hero-grid">
          <div>
            <h1 className="m-h1">
              Ihre LKW-Flotte.
              <br />
              Ohne <em>Zettelchaos</em>.
            </h1>
            <p>
              Fristen, Dokumente, Fahrer-Kommunikation — die Fuhrpark-Software, die für Speditionen gebaut wurde.
              Nicht für Dienstwagen.
            </p>
            <div className="m-hero-cta">
              <Link href={TRIAL_CTA_LINK} className="m-btn m-btn-primary" data-track="hero-trial-cta">
                {TRIAL_CTA_LABEL}
              </Link>
              <Link href="/#funktionen" className="m-btn m-btn-ghost">
                Funktionen ansehen
              </Link>
            </div>
            <div className="m-hero-badges">
              <span>✓ Keine Kreditkarte</span>
              <span>✓ Keine Hardware</span>
              <span>✓ DSGVO-konform · Server in Deutschland</span>
            </div>
          </div>
        </div>
        <HeroScrollIndicator />
      </header>

      <section className="m-intro" id="intro">
        <div className="m-wrap m-intro-inner" data-reveal>
          <p>
            Webfleet ist eine marktführende Software (SaaS), die das Fuhrparkmanagement erleichtert. Mit unserer
            modernen Technologie und intuitiven Benutzeroberfläche können Sie Ihre Betriebsabläufe in nur wenigen
            Klicks optimieren.
          </p>
          <p>
            Sie bleiben besser mit Ihrem Fuhrpark vernetzt, haben Einblick in den Standort Ihrer Fahrzeuge und sehen
            Echtzeit-Informationen zu ihrer Nutzung. Sie können diese Leistungsdaten von jedem beliebigen Gerät aus
            abrufen, um zu analysieren, wo Verbesserungen möglich wären.
          </p>
          <p>
            Dank Echtzeit-Verkehrsinformationen, Routenoptimierung und Funktionen für vordefinierte Fahrten sind
            Auftragsabwicklung und Kraftstoffeinsparungen einfach und effektiv. Erfahren Sie mehr über Ihre
            Möglichkeiten mit einer Fuhrparkmanagement Software.
          </p>
        </div>
      </section>

      <TrustStrip />

      <section className="m-teaser m-section" id="tools">
        <div className="m-wrap">
          <div className="m-teaser-card" data-reveal>
            <div className="m-teaser-text">
              <span className="m-eyebrow">Kostenloser Risiko-Check</span>
              <h2>Was kostet Sie eine verpasste Frist?</h2>
              <p>
                HU, UVV, Führerscheinkontrolle: Als Halter haften Sie. Rechnen Sie in 30 Sekunden aus, welches
                Bußgeld-Risiko in Ihrer Flotte steckt.
              </p>
              <Link href="/tools/bussgeld-rechner" className="m-btn m-btn-primary" data-track="teaser-bussgeld-cta">
                Risiko berechnen →
              </Link>
              <div className="m-tool-links">
                Weitere kostenlose Tools:{' '}
                <Link href="/tools/fahrtenbuch">Fahrtenbuch-Steuerrechner</Link> ·{' '}
                <Link href="/tools/tuev-checker">TÜV-Frist-Checker</Link>
              </div>
            </div>
            <div className="m-teaser-demo" aria-hidden="true">
              <div className="m-demo-row">
                <span>HU / SP überzogen</span>
                <b>1.240 €</b>
              </div>
              <div className="m-demo-row">
                <span>UVV versäumt</span>
                <b>1.800 €</b>
              </div>
              <div className="m-demo-row">
                <span>Führerscheinkontrolle</span>
                <b>2.520 €</b>
              </div>
              <div className="m-demo-row m-demo-total">
                <span>Ihr Risiko pro Jahr</span>
                <b>5.560 €</b>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="m-section" id="funktionen">
        <div className="m-wrap">
          <span className="m-eyebrow">Für den Alltag gebaut</span>
          <h2 className="m-h2">
            Drei Probleme, die Sie kennen.
            <br />
            Eine Software, die sie löst.
          </h2>
          <div className="m-karten">
            {problemCards.map((card) => (
              <article key={card.title} className="m-karte" data-reveal>
                <div className="m-icon">{card.icon}</div>
                <div className="m-frage">{card.title}</div>
                <p>{card.body}</p>
                {'flags' in card && card.flags ? <div className="m-flaggen">{card.flags}</div> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <ProductTour />

      <section className="m-zitat m-section">
        <div className="m-wrap">
          <div className="m-zitat-card" data-reveal>
            <div className="m-portrait">{partner.initials}</div>
            <div>
              <blockquote className="m-blockquote">&ldquo;{partner.quote}&rdquo;</blockquote>
              <div className="m-zitat-meta">
                <b>{partner.name}</b>
                {partner.company ? ` · Geschäftsführer, ${partner.company}` : ''} · {partner.vehicleCount}{' '}
                Fahrzeuge
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="m-section">
        <div className="m-wrap">
          <span className="m-eyebrow">Start in unter einer Stunde</span>
          <h2 className="m-h2">So einfach geht&apos;s</h2>
          <div className="m-schritte">
            {steps.map((step) => (
              <div key={step.title} className="m-schritt" data-reveal>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="m-teaser m-section" id="preise">
        <div className="m-wrap">
          <span className="m-eyebrow">Transparent &amp; planbar</span>
          <h2 className="m-h2">Ein Preis. Alles drin.</h2>
          <div className="m-preise-grid">
            {pricingTiers.map((tier) => (
              <article key={tier.range} className={`m-preis${tier.popular ? ' m-preis-beliebt' : ''}`} data-reveal>
                {tier.popular ? <div className="m-tag">Am beliebtesten</div> : null}
                <div className="m-gruppe">{tier.range}</div>
                <div className="m-betrag">
                  {tier.price} €<small> /Monat</small>
                </div>
                <div className="m-pro-fahrzeug">{tier.perVehicle}</div>
                <ul>
                  <li>Alle Funktionen</li>
                  <li>Unbegrenzte Fahrer</li>
                  <li>Monatlich kündbar</li>
                </ul>
                <Link
                  href={TRIAL_CTA_LINK}
                  className={`m-btn ${tier.popular ? 'm-btn-primary' : 'm-btn-ghost'}`}
                >
                  Kostenlos testen
                </Link>
              </article>
            ))}
          </div>
          <p className="m-alle-inkl">
            <b>Alle Funktionen inklusive.</b> Keine Hardware · Keine Plattformgebühr · Keine Kosten pro Fahrer ·
            Monatlich kündbar
          </p>
          <p className="m-enterprise-hint">
            Mehr als 100 Fahrzeuge?{' '}
            <a href={whatsAppHref()} target="_blank" rel="noopener noreferrer" data-track="pricing-enterprise-cta">
              Sprechen Sie mit uns — wir erstellen ein individuelles Angebot.
            </a>
          </p>
        </div>
      </section>

      <section className="m-section">
        <div className="m-wrap">
          <p className="m-vergleich-satz">
            Telematik-Anbieter verwalten Ihre LKW.
            <br />
            Wir verwalten alles drumherum:{' '}
            <span className="m-highlight">Papiere, Fristen, Menschen.</span>
          </p>
          <div className="m-vgl-tabelle" data-reveal>
            <div className="m-vgl-zeile m-vgl-kopf">
              <div />
              <div className="m-vgl-brand">TRANSIQ</div>
              <div>Typische Telematik</div>
            </div>
            {compareRows.map(([label, us, them]) => (
              <div key={label} className="m-vgl-zeile">
                <div>{label}</div>
                <div className="m-wir">
                  <span className="m-vgl-check" aria-hidden="true">✓</span> {us}
                </div>
                <div className="m-andere">{them}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="m-teaser m-section" id="faq">
        <div className="m-wrap">
          <h2 className="m-h2" style={{ textAlign: 'center' }}>
            Häufige Fragen
          </h2>
          <div className="m-faq">
            {faqItems.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <div className="m-antwort">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="m-final m-section" id="test">
        <div className="m-wrap">
          <h2 className="m-h2">Schluss mit Zettelchaos.</h2>
          <p className="m-sub">Starten Sie Ihren kostenlosen Test — mit Ihren echten Fahrzeugen, ohne Risiko.</p>
          <TrialForm />
          <a href={whatsAppHref()} target="_blank" rel="noopener noreferrer" className="m-wa" data-track="footer-whatsapp-cta">
            💬 Oder direkt per WhatsApp
          </a>
        </div>
      </section>

      <MarketingFooter />
      <WhatsAppButton />
      <div className="m-mobile-cta">
        <Link href={TRIAL_CTA_LINK} className="m-btn m-btn-primary" data-track="mobile-sticky-cta">
          {TRIAL_CTA_LABEL}
        </Link>
      </div>
    </div>
  );
}
