export type DriverNotifyKey =
  | 'request_approved'
  | 'request_rejected'
  | 'assignment_created'
  | 'checkin_added_to_einsatzplan'
  | 'messenger_message'
  | 'transport_approved'
  | 'transport_rejected'
  | 'license_check_due'
  | 'license_check_reminder'
  | 'license_check_approved'
  | 'license_check_rejected'
  | 'license_expiry_soon'
  | 'departure_check_reminder'
  | 'defect_confirm_due'
  | 'fine_assigned';

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
    checkin_added_to_einsatzplan: {
      title: 'Check-in onaylandı',
      message: (p) =>
        p.company
          ? `${p.company} einsatzın hazır. Yola çıkınca «Yola çıktım»a bas.`
          : 'Sabah check-in\'in onaylandı. Yola çıkınca «Yola çıktım»a bas.',
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
    license_check_due: {
      title: 'Ehliyet kontrolü zamanı',
      message: () => 'Dijital ehliyet kontrolünü uygulamadan tamamla: ön yüz, arka yüz ve selfie.',
    },
    license_check_reminder: {
      title: 'Ehliyet kontrolü hatırlatması',
      message: () => 'Ehliyet kontrolün hâlâ bekliyor. Lütfen bugün tamamla.',
    },
    license_check_approved: {
      title: 'Ehliyet kontrolü onaylandı',
      message: () => 'Dijital ehliyet kontrolün onaylandı.',
    },
    license_check_rejected: {
      title: 'Ehliyet kontrolü reddedildi',
      message: (p) => p.reason || 'Ehliyet kontrolün reddedildi. Lütfen yeniden gönder.',
    },
    license_expiry_soon: {
      title: 'Ehliyet süresi doluyor',
      message: (p) => `Ehliyetin ${p.date ?? ''} tarihinde sona eriyor (${p.days ?? ''} gün kaldı).`,
    },
    departure_check_reminder: {
      title: 'Abfahrtskontrolle fehlt',
      message: () => 'Sabah araç kontrolünü tamamla — işe başlamadan önce zorunlu.',
    },
    defect_confirm_due: {
      title: 'Arıza onayı bekliyor',
      message: () => 'Giderilen bir arıza onayını bekliyor. Uygulamadan onayla.',
    },
    fine_assigned: {
      title: 'Yeni trafik cezası',
      message: (p) =>
        `${p.plate ?? 'Araç'} için ${p.date ?? ''} tarihli ceza bildirimi — uygulamadan onayla.`,
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
    checkin_added_to_einsatzplan: {
      title: 'Check-in freigegeben',
      message: (p) =>
        p.company
          ? `Dein Check-in (${p.company}) ist im Einsatzplan. Tippe „Fahrt starten“, wenn du losfährst.`
          : 'Dein Morgen-Check-in ist freigegeben. Tippe „Fahrt starten“, wenn du losfährst.',
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
    license_check_due: {
      title: 'Führerscheinkontrolle fällig',
      message: () => 'Bitte digitale Führerscheinkontrolle in der App durchführen (Vorderseite, Rückseite, Selfie).',
    },
    license_check_reminder: {
      title: 'Erinnerung: Führerscheinkontrolle',
      message: () => 'Deine Führerscheinkontrolle ist noch offen. Bitte heute abschließen.',
    },
    license_check_approved: {
      title: 'Führerscheinkontrolle bestätigt',
      message: () => 'Deine digitale Führerscheinkontrolle wurde bestätigt.',
    },
    license_check_rejected: {
      title: 'Führerscheinkontrolle abgelehnt',
      message: (p) => p.reason || 'Deine Führerscheinkontrolle wurde abgelehnt. Bitte erneut einreichen.',
    },
    license_expiry_soon: {
      title: 'Führerschein läuft ab',
      message: (p) => `Dein Führerschein läuft am ${p.date ?? ''} ab (${p.days ?? ''} Tage Hinweis).`,
    },
    departure_check_reminder: {
      title: 'Abfahrtskontrolle fehlt',
      message: () => 'Bitte die morgendliche Abfahrtskontrolle abschließen — vor Arbeitsbeginn Pflicht.',
    },
    defect_confirm_due: {
      title: 'Mangel bestätigen',
      message: () => 'Ein behobener Mangel wartet auf deine Bestätigung in der App.',
    },
    fine_assigned: {
      title: 'Neuer Bußgeldbescheid',
      message: (p) =>
        `Bußgeld für ${p.plate ?? 'Fahrzeug'} vom ${p.date ?? ''} — bitte in der App bestätigen.`,
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
    checkin_added_to_einsatzplan: {
      title: 'Check-in approved',
      message: (p) =>
        p.company
          ? `Your ${p.company} assignment is ready. Tap Start journey when you leave.`
          : 'Your morning check-in was approved. Tap Start journey when you leave.',
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
    license_check_due: {
      title: 'License check due',
      message: () => 'Complete your digital license check in the app: front, back, and selfie.',
    },
    license_check_reminder: {
      title: 'License check reminder',
      message: () => 'Your license check is still pending. Please complete it today.',
    },
    license_check_approved: {
      title: 'License check approved',
      message: () => 'Your digital license check was approved.',
    },
    license_check_rejected: {
      title: 'License check rejected',
      message: (p) => p.reason || 'Your license check was rejected. Please resubmit.',
    },
    license_expiry_soon: {
      title: 'License expiring soon',
      message: (p) => `Your license expires on ${p.date ?? ''} (${p.days ?? ''}-day notice).`,
    },
    departure_check_reminder: {
      title: 'Departure check missing',
      message: () => 'Complete your morning vehicle check before starting work.',
    },
    defect_confirm_due: {
      title: 'Confirm repaired defect',
      message: () => 'A repaired defect is waiting for your confirmation in the app.',
    },
    fine_assigned: {
      title: 'New traffic fine',
      message: (p) =>
        `Fine for ${p.plate ?? 'vehicle'} on ${p.date ?? ''} — please acknowledge in the app.`,
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
