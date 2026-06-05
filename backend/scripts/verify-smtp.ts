/**
 * Verify SMTP credentials before production deploy.
 * Usage: npm run verify:smtp  (from backend/)
 */
import 'dotenv/config';
import nodemailer from 'nodemailer';

function fail(message: string): never {
  console.error(`[verify-smtp] FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const enabled = (process.env.SMTP_ENABLED ?? '').toLowerCase() === 'true';
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim();
  const to = process.env.SMTP_VERIFY_TO?.trim() || process.env.PRIVACY_CONTACT_EMAIL?.trim();

  if (!enabled) fail('SMTP_ENABLED is not true');
  if (!host) fail('SMTP_HOST is empty');
  if (!from) fail('SMTP_FROM is empty');

  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure =
    (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });

  console.log(`[verify-smtp] Connecting to ${host}:${port} (secure=${secure})…`);
  await transporter.verify();
  console.log('[verify-smtp] Connection OK');

  if (to) {
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'MyFleet SMTP-Verifikation',
      text: 'SMTP-Verbindung erfolgreich. Diese Test-E-Mail bestätigt den Produktions-Versand.',
      html: '<p>SMTP-Verbindung erfolgreich. Diese Test-E-Mail bestätigt den Produktions-Versand.</p>',
    });
    console.log(`[verify-smtp] Test message sent to ${to} (messageId=${info.messageId ?? 'n/a'})`);
  } else {
    console.warn('[verify-smtp] Set SMTP_VERIFY_TO or PRIVACY_CONTACT_EMAIL to send a test message.');
  }

  console.log('[verify-smtp] PASS');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  fail(message);
});
