export type DriverNotifyKey =
  | 'request_approved'
  | 'request_rejected'
  | 'assignment_created'
  | 'messenger_message'
  | 'transport_approved'
  | 'transport_rejected';

type CopyTemplate = {
  title: string;
  message: (params: Record<string, string>) => string;
};

const COPY: Record<string, Record<DriverNotifyKey, CopyTemplate>> = {
  tr: {
    request_approved: {
      title: 'İzin talebin onaylandı',
      message: () => 'İzin talebin onaylandı ve takvime işlendi.',
    },
    request_rejected: {
      title: 'İzin talebin reddedildi',
      message: () => 'İzin talebin reddedildi. Detaylar için ofisle iletişime geç.',
    },
    assignment_created: {
      title: 'Yeni einsatz',
      message: (p) => `${p.date} tarihinde yeni bir einsatzın var.`,
    },
    messenger_message: {
      title: 'Yeni mesaj',
      message: (p) => p.preview || 'Ofisten yeni bir mesajın var.',
    },
    transport_approved: {
      title: 'Taşıma talebin onaylandı',
      message: () => 'Taşıma talebin onaylandı ve einsatz oluşturuldu.',
    },
    transport_rejected: {
      title: 'Taşıma talebin reddedildi',
      message: (p) =>
        p.reason
          ? `Taşıma talebin reddedildi: ${p.reason}`
          : 'Taşıma talebin reddedildi.',
    },
  },
  de: {
    request_approved: {
      title: 'Antrag genehmigt',
      message: () => 'Dein Antrag wurde genehmigt und im Kalender eingetragen.',
    },
    request_rejected: {
      title: 'Antrag abgelehnt',
      message: () => 'Dein Antrag wurde abgelehnt. Bitte wende dich an das Büro.',
    },
    assignment_created: {
      title: 'Neuer Einsatz',
      message: (p) => `Du hast einen neuen Einsatz am ${p.date}.`,
    },
    messenger_message: {
      title: 'Neue Nachricht',
      message: (p) => p.preview || 'Du hast eine neue Nachricht erhalten.',
    },
    transport_approved: {
      title: 'Transportanfrage genehmigt',
      message: () => 'Deine Transportanfrage wurde genehmigt und ein Einsatz wurde erstellt.',
    },
    transport_rejected: {
      title: 'Transportanfrage abgelehnt',
      message: (p) =>
        p.reason
          ? `Deine Transportanfrage wurde abgelehnt: ${p.reason}`
          : 'Deine Transportanfrage wurde abgelehnt.',
    },
  },
  en: {
    request_approved: {
      title: 'Request approved',
      message: () => 'Your leave request was approved and added to the calendar.',
    },
    request_rejected: {
      title: 'Request rejected',
      message: () => 'Your leave request was rejected. Contact the office for details.',
    },
    assignment_created: {
      title: 'New assignment',
      message: (p) => `You have a new assignment on ${p.date}.`,
    },
    messenger_message: {
      title: 'New message',
      message: (p) => p.preview || 'You have a new message.',
    },
    transport_approved: {
      title: 'Transport request approved',
      message: () => 'Your transport request was approved and an assignment was created.',
    },
    transport_rejected: {
      title: 'Transport request rejected',
      message: (p) =>
        p.reason
          ? `Your transport request was rejected: ${p.reason}`
          : 'Your transport request was rejected.',
    },
  },
};

const DEFAULT_LANG = 'de';

export function resolveDriverNotifyCopy(
  language: string | null | undefined,
  key: DriverNotifyKey,
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
