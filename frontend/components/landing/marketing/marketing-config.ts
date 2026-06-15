/** Opens the login form without dev auto-login. */
export const LOGIN_HREF = '/login?manual=1';
export const TRIAL_CTA_HREF = '/login';
export const TRIAL_CTA_ANCHOR = '#test';
export const TRIAL_CTA_LINK = '/#test';
export const TRIAL_CTA_LABEL = '14 Tage kostenlos testen';
export const TRIAL_CTA_SUBLINE = 'Keine Kreditkarte · Keine Hardware · Einrichtung in 1 Stunde';

export function whatsAppHref(): string {
  const configured = process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim();
  if (configured) return configured;
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_PHONE?.trim()?.replace(/\D/g, '') ?? '493012345678';
  return `https://wa.me/${phone}`;
}

export function companyName(): string {
  return process.env.NEXT_PUBLIC_DATA_CONTROLLER_NAME?.trim() ?? 'MyFleet';
}

function parseStatNumber(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const normalized = raw.replace(/[^\d]/g, '');
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function landingStatsAnimated() {
  return {
    vehicles: parseStatNumber(process.env.NEXT_PUBLIC_LANDING_STAT_VEHICLES, 1847),
    documents: parseStatNumber(process.env.NEXT_PUBLIC_LANDING_STAT_DOCUMENTS, 5420),
    alerts: parseStatNumber(process.env.NEXT_PUBLIC_LANDING_STAT_ALERTS, 312),
  };
}

export const faqItems = [
  {
    q: 'Brauche ich Hardware?',
    a: 'Nein. Das Smartphone des Fahrers reicht — keine Einbauten, keine Werkstatttermine, keine Gerätekosten.',
  },
  {
    q: 'Ist das DSGVO-konform?',
    a: 'Ja. Ortung läuft nur während der Schicht, der Fahrer sieht jederzeit transparent, was erfasst wird. Einen Auftragsverarbeitungsvertrag (AVV) stellen wir bereit.',
  },
  {
    q: 'Was sagt der Betriebsrat dazu?',
    a: 'Keine Ortung außerhalb der Arbeitszeit, volle Transparenz für Fahrer — und wir liefern eine Muster-Betriebsvereinbarung mit.',
  },
  {
    q: 'Wie lange dauert die Einrichtung?',
    a: 'Unter einer Stunde. Fahrzeuge per Excel importieren, Fahrer per Link einladen — fertig.',
  },
  {
    q: 'Welche Sprachen unterstützt die Fahrer-App?',
    a: 'Deutsch, Polnisch, Türkisch, Englisch, Französisch, Italienisch, Spanisch und Niederländisch — Nachrichten werden automatisch übersetzt.',
  },
  {
    q: 'Kann ich monatlich kündigen?',
    a: 'Ja. Keine Mindestlaufzeit, keine versteckten Kosten.',
  },
];

export function partnerStory() {
  const name = process.env.NEXT_PUBLIC_PARTNER_NAME?.trim() ?? 'Ümit Han';
  return {
    name,
    initials: name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    company: process.env.NEXT_PUBLIC_PARTNER_COMPANY?.trim() ?? '',
    vehicleCount: process.env.NEXT_PUBLIC_PARTNER_VEHICLES?.trim() ?? '70',
    quote:
      process.env.NEXT_PUBLIC_PARTNER_QUOTE?.trim() ??
      'Ich nutze es für meine 70 Fahrzeuge. Die bekannten Tools sind für Dienstwagen gebaut — nicht für uns. Also haben wir es selbst gemacht. Heute läuft meine ganze Flotte darüber.',
  };
}
