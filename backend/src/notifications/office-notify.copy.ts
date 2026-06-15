export type OfficeNotifyKey =
  | 'transport_request_created'
  | 'transport_request_needs_review'
  | 'driver_request_created'
  | 'accident_report_created'
  | 'cargo_damage_report_created';

type CopyTemplate = {
  title: string;
  message: (params: Record<string, string>) => string;
};

const COPY: Record<string, Record<OfficeNotifyKey, CopyTemplate>> = {
  de: {
    transport_request_created: {
      title: 'Neue Transportanfrage',
      message: (p) =>
        `${p.driverName} hat eine Transportanfrage für ${p.companyName} am ${p.date} eingereicht.`,
    },
    transport_request_needs_review: {
      title: 'Transportanfrage: Prüfung nötig',
      message: (p) =>
        `Transportanfrage von ${p.driverName} (${p.companyName}) benötigt Prüfung: ${p.reason}`,
    },
    driver_request_created: {
      title: 'Neuer Fahrerantrag',
      message: (p) => `${p.driverName} hat einen Antrag (${p.requestType}) eingereicht.`,
    },
    accident_report_created: {
      title: 'Neue Unfallmeldung',
      message: (p) =>
        `${p.driverName} hat einen Unfall gemeldet (${p.plateNumber}${p.location ? ` · ${p.location}` : ''}).`,
    },
    cargo_damage_report_created: {
      title: 'Neuer Ladungsschaden',
      message: (p) =>
        `${p.driverName} hat Ladungsschaden gemeldet (${p.plateNumber}${p.cargoSummary ? ` · ${p.cargoSummary}` : ''}).`,
    },
  },
  en: {
    transport_request_created: {
      title: 'New transport request',
      message: (p) =>
        `${p.driverName} submitted a transport request for ${p.companyName} on ${p.date}.`,
    },
    transport_request_needs_review: {
      title: 'Transport request needs review',
      message: (p) =>
        `Transport request from ${p.driverName} (${p.companyName}) needs review: ${p.reason}`,
    },
    driver_request_created: {
      title: 'New driver request',
      message: (p) => `${p.driverName} submitted a ${p.requestType} request.`,
    },
    accident_report_created: {
      title: 'New accident report',
      message: (p) =>
        `${p.driverName} reported an accident (${p.plateNumber}${p.location ? ` · ${p.location}` : ''}).`,
    },
    cargo_damage_report_created: {
      title: 'New cargo damage report',
      message: (p) =>
        `${p.driverName} reported cargo damage (${p.plateNumber}${p.cargoSummary ? ` · ${p.cargoSummary}` : ''}).`,
    },
  },
  tr: {
    transport_request_created: {
      title: 'Yeni taşıma talebi',
      message: (p) =>
        `${p.driverName}, ${p.date} için ${p.companyName} adına taşıma talebi gönderdi.`,
    },
    transport_request_needs_review: {
      title: 'Taşıma talebi incelemede',
      message: (p) =>
        `${p.driverName} (${p.companyName}) taşıma talebi inceleme gerektiriyor: ${p.reason}`,
    },
    driver_request_created: {
      title: 'Yeni şoför talebi',
      message: (p) => `${p.driverName} yeni bir talep gönderdi (${p.requestType}).`,
    },
    accident_report_created: {
      title: 'Yeni kaza bildirimi',
      message: (p) =>
        `${p.driverName} kaza bildirdi (${p.plateNumber}${p.location ? ` · ${p.location}` : ''}).`,
    },
    cargo_damage_report_created: {
      title: 'Yeni yük hasarı bildirimi',
      message: (p) =>
        `${p.driverName} yük hasarı bildirdi (${p.plateNumber}${p.cargoSummary ? ` · ${p.cargoSummary}` : ''}).`,
    },
  },
};

const DEFAULT_LANG = 'de';

export function resolveOfficeNotifyCopy(
  language: string | null | undefined,
  key: OfficeNotifyKey,
  params: Record<string, string> = {},
): { title: string; message: string } {
  const lang = language?.trim().toLowerCase();
  const bucket = (lang && COPY[lang]) || COPY[DEFAULT_LANG];
  const template = bucket[key] ?? COPY[DEFAULT_LANG][key];
  return {
    title: template.title,
    message: template.message(params),
  };
}
