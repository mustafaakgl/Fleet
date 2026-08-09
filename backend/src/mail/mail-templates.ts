import { getFrontendUrl } from '../config/env.validation';
import { formatGermanCurrency, formatGermanDate } from '../invoicing/einvoice/format';

const BRAND = 'Fleet';
const FOOTER = `Mit freundlichen Grüßen\n${BRAND} Team`;
const BRAND_COLOR = '#003366';
const SETTINGS_URL = `${getFrontendUrl()}/settings`;

function formatDeDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Europe/Berlin',
    });
  } catch {
    return iso;
  }
}

function htmlLayout(body: string): string {
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><title>${BRAND}</title></head>
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#333333;max-width:560px;margin:0 auto;padding:24px;background:#F5F7FA">
  <div style="margin-bottom:24px;padding:16px 20px;background:#ffffff;border:1px solid #DEE2E6;border-radius:8px">
    <div style="font-weight:700;font-size:20px;color:${BRAND_COLOR};letter-spacing:-0.02em">${BRAND}</div>
    <div style="font-size:13px;color:#4B5563;margin-top:4px">Flottenmanagement für den Mittelstand</div>
  </div>
  <div style="background:#ffffff;border:1px solid #DEE2E6;border-radius:8px;padding:20px">
    ${body}
  </div>
  <hr style="border:none;border-top:1px solid #DEE2E6;margin:24px 0" />
  <p style="font-size:12px;color:#4B5563;line-height:1.6">
    Diese E-Mail wurde automatisch versendet. Bitte antworten Sie nicht direkt auf diese Nachricht.<br />
    <a href="${SETTINGS_URL}" style="color:${BRAND_COLOR}">Benachrichtigungseinstellungen</a> ·
    MyFleet GmbH · Musterstraße 1 · 80331 München
  </p>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${label}</a></p>`;
}

export type MailTemplateResult = { subject: string; text: string; html: string };
type SupportedMailLanguage = 'de' | 'en' | 'tr';

function resolveMailLanguage(language?: string | null): SupportedMailLanguage {
  if (language === 'en' || language === 'tr') return language;
  return 'de';
}

export function invitationMail(params: {
  fullName: string;
  inviteUrl: string;
  expiresAt: string;
}): MailTemplateResult {
  const expires = formatDeDate(params.expiresAt);
  const subject = `Einladung zu ${BRAND}`;
  const text = [
    `Hallo ${params.fullName},`,
    '',
    `Sie wurden zu ${BRAND} eingeladen. Bitte richten Sie Ihr Passwort über den folgenden Link ein:`,
    params.inviteUrl,
    '',
    `Der Link ist bis ${expires} gültig.`,
    '',
    FOOTER,
  ].join('\n');

  const html = htmlLayout(`
    <p>Hallo <strong>${params.fullName}</strong>,</p>
    <p>Sie wurden zu <strong>${BRAND}</strong> eingeladen. Bitte richten Sie Ihr Passwort ein:</p>
    ${button(params.inviteUrl, 'Einladung annehmen')}
    <p style="font-size:14px;color:#4B5563">Der Link ist bis <strong>${expires}</strong> gültig.</p>
  `);

  return { subject, text, html };
}

export function passwordResetMail(params: {
  resetUrl: string;
  expiresAt: string;
}): MailTemplateResult {
  const expires = formatDeDate(params.expiresAt);
  const subject = `${BRAND} — Passwort zurücksetzen`;
  const text = [
    'Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten.',
    '',
    params.resetUrl,
    '',
    `Der Link ist bis ${expires} gültig.`,
    '',
    'Wenn Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.',
    '',
    FOOTER,
  ].join('\n');

  const html = htmlLayout(`
    <p>Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten.</p>
    ${button(params.resetUrl, 'Passwort zurücksetzen')}
    <p style="font-size:14px;color:#4B5563">Gültig bis <strong>${expires}</strong>. Falls Sie dies nicht angefordert haben, ignorieren Sie diese E-Mail.</p>
  `);

  return { subject, text, html };
}

export function welcomeMail(params: {
  fullName: string;
  fleetName: string;
  loginUrl?: string;
}): MailTemplateResult {
  const loginUrl = params.loginUrl ?? `${getFrontendUrl()}/login`;
  const subject = `Willkommen bei ${BRAND} — ${params.fleetName}`;
  const text = [
    `Hallo ${params.fullName},`,
    '',
    `Ihr Flottenkonto „${params.fleetName}" wurde erfolgreich eingerichtet.`,
    '',
    `Anmelden: ${loginUrl}`,
    '',
    'Nächste Schritte:',
    '1. Teammitglieder einladen',
    '2. Fahrer und Fahrzeuge importieren (CSV)',
    '3. Ersten Einsatz planen',
    '',
    FOOTER,
  ].join('\n');

  const html = htmlLayout(`
    <p>Hallo <strong>${params.fullName}</strong>,</p>
    <p>Ihr Flottenkonto <strong>${params.fleetName}</strong> wurde erfolgreich eingerichtet.</p>
    ${button(loginUrl, 'Jetzt anmelden')}
    <p><strong>Nächste Schritte:</strong></p>
    <ol>
      <li>Teammitglieder einladen</li>
      <li>Fahrer und Fahrzeuge per CSV importieren</li>
      <li>Ersten Einsatz planen</li>
    </ol>
  `);

  return { subject, text, html };
}

export function companyEmailMail(params: {
  subject: string;
  body: string;
  companyName?: string;
}): MailTemplateResult {
  const subject = params.subject;
  const text = params.body;
  const companyLine = params.companyName
    ? `<p style="font-size:13px;color:#4B5563">Auftraggeber: ${params.companyName}</p>`
    : '';

  const html = htmlLayout(`
    ${companyLine}
    <div style="white-space:pre-wrap">${params.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  `);

  return { subject, text, html };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * One invoiced trip as the customer recognises it: which day, which route, what was
 * carried and on which vehicle. Assembled from the invoice line snapshots, so the
 * overview keeps showing what was invoiced even after the assignment is edited.
 */
export type InvoiceServiceRow = {
  serviceDate: Date | null;
  route: string | null;
  cargo: string | null;
  vehiclePlate: string | null;
};

/**
 * A month of daily tours can run to a hundred lines. The complete list is in the attached
 * invoice; the cover letter only carries enough of it to be recognisable at a glance.
 */
const MAX_SERVICE_ROWS = 25;

/**
 * Cover letter for a finalized invoice. The legally binding content lives in the attached
 * PDF/XML, so this mail only restates the identifying data a bookkeeper needs to file it:
 * number, service period, amount, due date and the bank account to pay into, plus the
 * trip overview that lets the customer match the amount against their own dispatch list.
 * Everything is taken from the invoice snapshot, never from live master data — the letter
 * and the attachment must agree even after the customer or the billing profile is edited.
 */
export function invoiceDeliveryMail(params: {
  invoiceNumber: string;
  sellerName: string;
  customerName: string;
  invoiceDate: Date;
  dueDate: Date | null;
  servicePeriodStart: Date;
  servicePeriodEnd: Date;
  grossCents: number;
  currency: string;
  iban: string;
  bic: string | null;
  bankName: string | null;
  includesXml: boolean;
  footerText: string | null;
  language?: string | null;
  services?: InvoiceServiceRow[];
}): MailTemplateResult {
  const language = resolveMailLanguage(params.language);
  const copy = {
    de: {
      subject: `Rechnung ${params.invoiceNumber} von ${params.sellerName}`,
      attachmentNote: params.includesXml
        ? 'Die Rechnung liegt dieser E-Mail als PDF und als elektronische Rechnung im XML-Format bei.'
        : 'Die Rechnung liegt dieser E-Mail als PDF bei.',
      facts: {
        invoiceNumber: 'Rechnungsnummer',
        invoiceDate: 'Rechnungsdatum',
        servicePeriod: 'Leistungszeitraum',
        invoiceAmount: 'Rechnungsbetrag',
        payableUntil: 'Zahlbar bis',
        bank: 'Bank',
      },
      services: {
        heading: 'Abgerechnete Fahrten',
        date: 'Datum',
        route: 'Strecke',
        cargo: 'Ladung',
        vehicle: 'Fahrzeug',
        more: 'sowie {{count}} weitere Positionen – die vollständige Aufstellung finden Sie in der beigefügten Rechnung.',
      },
      salutation: 'Sehr geehrte Damen und Herren,',
      intro: `anbei erhalten Sie unsere Rechnung ${params.invoiceNumber} vom {{invoiceDate}}.`,
      transfer: 'Bitte überweisen Sie den Betrag{{dueDate}} unter Angabe der Rechnungsnummer als Verwendungszweck.',
      transferDueDate: ' bis zum {{dueDate}}',
      closing: 'Mit freundlichen Grüßen',
      htmlIntro:
        'anbei erhalten Sie unsere Rechnung <strong>{{invoiceNumber}}</strong> vom {{invoiceDate}} für <strong>{{customerName}}</strong>.',
      htmlTransfer:
        'Bitte überweisen Sie den Betrag{{dueDate}} unter Angabe der Rechnungsnummer als Verwendungszweck.',
      htmlTransferDueDate: ' bis zum <strong>{{dueDate}}</strong>',
    },
    en: {
      subject: `Invoice ${params.invoiceNumber} from ${params.sellerName}`,
      attachmentNote: params.includesXml
        ? 'The invoice is attached to this email as a PDF and as an electronic XML invoice.'
        : 'The invoice is attached to this email as a PDF.',
      facts: {
        invoiceNumber: 'Invoice number',
        invoiceDate: 'Invoice date',
        servicePeriod: 'Service period',
        invoiceAmount: 'Invoice amount',
        payableUntil: 'Payable by',
        bank: 'Bank',
      },
      services: {
        heading: 'Invoiced trips',
        date: 'Date',
        route: 'Route',
        cargo: 'Load',
        vehicle: 'Vehicle',
        more: 'plus {{count}} further items – the complete list is in the attached invoice.',
      },
      salutation: 'Dear Sir or Madam,',
      intro: 'Please find attached our invoice {{invoiceNumber}} dated {{invoiceDate}}.',
      transfer: 'Please transfer the amount{{dueDate}} and use the invoice number as payment reference.',
      transferDueDate: ' by {{dueDate}}',
      closing: 'Kind regards',
      htmlIntro:
        'Please find attached our invoice <strong>{{invoiceNumber}}</strong> dated {{invoiceDate}} for <strong>{{customerName}}</strong>.',
      htmlTransfer: 'Please transfer the amount{{dueDate}} and use the invoice number as payment reference.',
      htmlTransferDueDate: ' by <strong>{{dueDate}}</strong>',
    },
    tr: {
      subject: `${params.sellerName} tarafindan gonderilen ${params.invoiceNumber} no.lu fatura`,
      attachmentNote: params.includesXml
        ? 'Fatura bu e-postaya PDF ve XML formatinda e-fatura olarak eklenmistir.'
        : 'Fatura bu e-postaya PDF olarak eklenmistir.',
      facts: {
        invoiceNumber: 'Fatura numarasi',
        invoiceDate: 'Fatura tarihi',
        servicePeriod: 'Hizmet donemi',
        invoiceAmount: 'Fatura tutari',
        payableUntil: 'Son odeme tarihi',
        bank: 'Banka',
      },
      services: {
        heading: 'Faturalanan seferler',
        date: 'Tarih',
        route: 'Guzergah',
        cargo: 'Yuk',
        vehicle: 'Arac',
        more: 've {{count}} kalem daha – tam dokumu ekteki faturada bulabilirsiniz.',
      },
      salutation: 'Sayin Yetkili,',
      intro: '{{invoiceDate}} tarihli {{invoiceNumber}} no.lu faturamiz ekte bilginize sunulmustur.',
      transfer: 'Lutfen odemeyi{{dueDate}} fatura numarasini aciklama olarak belirterek yapiniz.',
      transferDueDate: ' {{dueDate}} tarihine kadar',
      closing: 'Saygilarimizla',
      htmlIntro:
        '<strong>{{customerName}}</strong> icin duzenlenen <strong>{{invoiceNumber}}</strong> no.lu, {{invoiceDate}} tarihli faturamiz ektedir.',
      htmlTransfer: 'Lutfen odemeyi{{dueDate}} fatura numarasini aciklama olarak belirterek yapiniz.',
      htmlTransferDueDate: ' <strong>{{dueDate}}</strong> tarihine kadar',
    },
  }[language];

  const amount = formatGermanCurrency(params.grossCents, params.currency);
  const invoiceDate = formatGermanDate(params.invoiceDate);
  const servicePeriod = `${formatGermanDate(params.servicePeriodStart)} – ${formatGermanDate(params.servicePeriodEnd)}`;
  const dueDate = params.dueDate ? formatGermanDate(params.dueDate) : null;
  const subject = copy.subject;
  const attachmentNote = copy.attachmentNote;

  const facts: Array<[string, string]> = [
    [copy.facts.invoiceNumber, params.invoiceNumber],
    [copy.facts.invoiceDate, invoiceDate],
    [copy.facts.servicePeriod, servicePeriod],
    [copy.facts.invoiceAmount, amount],
  ];
  if (dueDate) facts.push([copy.facts.payableUntil, dueDate]);
  facts.push(['IBAN', params.iban]);
  if (params.bic) facts.push(['BIC', params.bic]);
  if (params.bankName) facts.push([copy.facts.bank, params.bankName]);

  // The trips keep the order the invoice lists them in, so the letter and the attachment
  // can be read side by side. A missing value stays visible as a dash rather than
  // collapsing the row — a blank cell reads like an omission the customer should query.
  const services = params.services ?? [];
  const shownServices = services.slice(0, MAX_SERVICE_ROWS);
  const hiddenServiceCount = services.length - shownServices.length;
  const serviceCells = shownServices.map((service) => ({
    date: service.serviceDate ? formatGermanDate(service.serviceDate) : '–',
    route: service.route?.trim() || '–',
    cargo: service.cargo?.trim() || '–',
    vehicle: service.vehiclePlate?.trim() || '–',
  }));
  const moreServicesNote =
    hiddenServiceCount > 0
      ? copy.services.more.replace('{{count}}', String(hiddenServiceCount))
      : null;

  const transferDueDate = dueDate
    ? copy.transferDueDate.replace('{{dueDate}}', dueDate)
    : '';
  const htmlTransferDueDate = dueDate
    ? copy.htmlTransferDueDate.replace('{{dueDate}}', dueDate)
    : '';

  const text = [
    copy.salutation,
    '',
    copy.intro
      .replace('{{invoiceNumber}}', params.invoiceNumber)
      .replace('{{invoiceDate}}', invoiceDate),
    '',
    ...facts.map(([label, value]) => `${label}: ${value}`),
    ...(serviceCells.length
      ? [
          '',
          `${copy.services.heading}:`,
          '',
          ...serviceCells.map(
            (service) =>
              `- ${service.date} | ${copy.services.route}: ${service.route}` +
              ` | ${copy.services.cargo}: ${service.cargo}` +
              ` | ${copy.services.vehicle}: ${service.vehicle}`,
          ),
          ...(moreServicesNote ? [moreServicesNote] : []),
        ]
      : []),
    '',
    copy.transfer.replace('{{dueDate}}', transferDueDate),
    attachmentNote,
    ...(params.footerText ? ['', params.footerText] : []),
    '',
    copy.closing,
    params.sellerName,
  ].join('\n');

  const rows = facts
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#4B5563;font-size:14px">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:14px"><strong>${escapeHtml(value)}</strong></td></tr>`,
    )
    .join('');

  const serviceHeaderCells = [
    copy.services.date,
    copy.services.route,
    copy.services.cargo,
    copy.services.vehicle,
  ]
    .map(
      (label) =>
        `<th align="left" style="padding:6px 12px 6px 0;border-bottom:1px solid #DEE2E6;color:#4B5563;font-size:12px;font-weight:600">${escapeHtml(label)}</th>`,
    )
    .join('');
  const serviceRows = serviceCells
    .map(
      (service) =>
        `<tr>${[service.date, service.route, service.cargo, service.vehicle]
          .map(
            (value) =>
              `<td style="padding:6px 12px 6px 0;border-bottom:1px solid #F1F3F5;font-size:13px;vertical-align:top">${escapeHtml(value)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  const serviceTable = serviceCells.length
    ? `<p style="font-size:14px;margin:20px 0 8px"><strong>${escapeHtml(copy.services.heading)}</strong></p>
    <table style="border-collapse:collapse;width:100%"><thead><tr>${serviceHeaderCells}</tr></thead><tbody>${serviceRows}</tbody></table>
    ${moreServicesNote ? `<p style="font-size:13px;color:#4B5563;margin:8px 0 0">${escapeHtml(moreServicesNote)}</p>` : ''}`
    : '';

  const html = htmlLayout(`
    <p>${copy.salutation}</p>
    <p>${copy.htmlIntro
      .replace('{{invoiceNumber}}', escapeHtml(params.invoiceNumber))
      .replace('{{invoiceDate}}', invoiceDate)
      .replace('{{customerName}}', escapeHtml(params.customerName))}</p>
    <table style="border-collapse:collapse;margin:16px 0">${rows}</table>
    ${serviceTable}
    <p style="font-size:14px">${copy.htmlTransfer.replace('{{dueDate}}', htmlTransferDueDate)}</p>
    <p style="font-size:14px;color:#4B5563">${attachmentNote}</p>
    ${params.footerText ? `<p style="font-size:13px;color:#4B5563;white-space:pre-wrap">${escapeHtml(params.footerText)}</p>` : ''}
    <p style="font-size:14px">${copy.closing}<br />${escapeHtml(params.sellerName)}</p>
  `);

  return { subject, text, html };
}

export function smtpTestMail(): MailTemplateResult {
  const subject = `${BRAND} — SMTP-Test erfolgreich`;
  const text = [
    'Dies ist eine Test-E-Mail von Fleet.',
    '',
    'Wenn Sie diese Nachricht erhalten haben, ist der SMTP-Versand korrekt konfiguriert.',
    '',
    FOOTER,
  ].join('\n');

  const html = htmlLayout(`
    <p>Dies ist eine <strong>Test-E-Mail</strong> von ${BRAND}.</p>
    <p style="color:#4CAF50">✓ SMTP-Versand ist korrekt konfiguriert.</p>
  `);

  return { subject, text, html };
}
