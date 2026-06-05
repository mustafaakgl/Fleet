import { getFrontendUrl } from '../config/env.validation';

const BRAND = 'MyFleet';
const FOOTER = `Mit freundlichen Grüßen\n${BRAND} Team`;

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
<body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5;color:#1e293b;max-width:560px;margin:0 auto;padding:24px">
  <div style="margin-bottom:24px;font-weight:700;font-size:18px;color:#1d4ed8">${BRAND}</div>
  ${body}
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="font-size:12px;color:#64748b">Diese E-Mail wurde automatisch versendet. Bitte antworten Sie nicht direkt auf diese Nachricht.</p>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${label}</a></p>`;
}

export type MailTemplateResult = { subject: string; text: string; html: string };

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
    <p style="font-size:14px;color:#64748b">Der Link ist bis <strong>${expires}</strong> gültig.</p>
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
    'Sie haben eine Anfrage zum Zurücksetzen Ihres MyFleet-Passworts erhalten.',
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
    <p style="font-size:14px;color:#64748b">Gültig bis <strong>${expires}</strong>. Falls Sie dies nicht angefordert haben, ignorieren Sie diese E-Mail.</p>
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
    ? `<p style="font-size:13px;color:#64748b">Auftraggeber: ${params.companyName}</p>`
    : '';

  const html = htmlLayout(`
    ${companyLine}
    <div style="white-space:pre-wrap">${params.body.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  `);

  return { subject, text, html };
}

export function smtpTestMail(): MailTemplateResult {
  const subject = `${BRAND} — SMTP-Test erfolgreich`;
  const text = [
    'Dies ist eine Test-E-Mail von MyFleet.',
    '',
    'Wenn Sie diese Nachricht erhalten haben, ist der SMTP-Versand korrekt konfiguriert.',
    '',
    FOOTER,
  ].join('\n');

  const html = htmlLayout(`
    <p>Dies ist eine <strong>Test-E-Mail</strong> von ${BRAND}.</p>
    <p style="color:#059669">✓ SMTP-Versand ist korrekt konfiguriert.</p>
  `);

  return { subject, text, html };
}
