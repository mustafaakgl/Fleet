export type OfficeNotifyKey =
  | 'transport_request_created'
  | 'transport_request_needs_review'
  | 'driver_request_created';

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
