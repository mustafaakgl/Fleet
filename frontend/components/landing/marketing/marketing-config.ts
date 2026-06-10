export const LOGIN_HREF = '/login';
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

export function partnerStory() {
  const name = process.env.NEXT_PUBLIC_PARTNER_NAME?.trim() ?? 'Michael Schneider';
  return {
    name,
    initials: name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase(),
    company: process.env.NEXT_PUBLIC_PARTNER_COMPANY?.trim() ?? 'Schneider Spedition GmbH',
    vehicleCount: process.env.NEXT_PUBLIC_PARTNER_VEHICLES?.trim() ?? '70',
    quote:
      process.env.NEXT_PUBLIC_PARTNER_QUOTE?.trim() ??
      'Seit 20 Jahren führe ich LKW-Flotten. Die bekannten Tools sind für Dienstwagen gebaut — nicht für uns. Also haben wir es selbst gemacht. Heute läuft meine ganze Flotte darüber.',
  };
}
