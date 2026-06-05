# SMTP Go-Live — Production E-Mail

Fleet **startet nicht** mit `NODE_ENV=production`, wenn SMTP nicht konfiguriert ist.

---

## 1. Provider wählen (EU-Region empfohlen)

| Provider | Region | Hinweis |
|----------|--------|---------|
| Postmark | EU möglich | Transactional, gute Zustellbarkeit |
| SendGrid | EU | Breites Feature-Set |
| Mailgun | EU | API + SMTP |
| Amazon SES | eu-central-1 | Günstig, mehr Setup |

---

## 2. Backend `.env` (Production)

```env
NODE_ENV=production
FRONTEND_URL=https://app.myfleet.app

SMTP_ENABLED=true
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<postmark-server-token>
SMTP_PASS=<postmark-server-token>
SMTP_FROM="MyFleet <noreply@myfleet.app>"
SMTP_VERIFY_TO=ops@myfleet.app

DATA_CONTROLLER_NAME="MyFleet GmbH"
PRIVACY_CONTACT_EMAIL=privacy@myfleet.app
```

`SMTP_FROM` muss eine **verifizierte Absender-Domain** beim Provider sein.

---

## 3. DNS (SPF + DKIM + DMARC)

Domain des Absenders (z. B. `myfleet.app`):

```bash
chmod +x scripts/check-email-dns.sh
./scripts/check-email-dns.sh myfleet.app
```

**Beispiel SPF (Postmark):**
```
v=spf1 include:spf.mtasv.net ~all
```

**Beispiel DMARC:**
```
v=DMARC1; p=quarantine; rua=mailto:dmarc@myfleet.app
```

DKIM-Selector kommt vom Provider (z. B. `pm._domainkey.myfleet.app`).

---

## 4. Verifikation vor Deploy

```bash
cd backend
cp .env.example .env   # oder Prod-Secrets eintragen
npm run verify:smtp
```

Erwartung: `Connection OK` + Test-E-Mail in Inbox (nicht Spam).

---

## 5. Deploy + Health

```bash
# Readiness inkl. SMTP (nur production)
curl -s https://api.myfleet.app/api/v1/health/ready | jq
# checks.smtp: "ok"
```

Nach Deploy als Admin: `/getting-started` → **Test-E-Mail senden**.

---

## 6. E2E-Flows testen

| Flow | Auslöser | Erwartung |
|------|----------|-----------|
| Einladung | Einsatzplan → Benutzer einladen | Inbox + Accept-Link |
| Passwort-Reset | Login → Passwort vergessen | Reset-Link |
| Willkommen | `POST /onboarding/setup` | Admin-Inbox |
| CompanyEmail | Einsatzplan → E-Mail senden | Kunden-Inbox |

---

## 7. Docker Compose Production

```bash
cp .env.production.example .env
# Secrets eintragen
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

---

## Troubleshooting

| Symptom | Ursache | Fix |
|---------|---------|-----|
| Boot-Fehler `SMTP_ENABLED must be true` | Prod ohne SMTP | `.env` setzen |
| `checks.smtp: error` | Falsche Credentials / Firewall | `npm run verify:smtp` |
| E-Mail im Spam | Fehlende SPF/DKIM | DNS + `SMTP_FROM` Domain |
| Link zeigt localhost | `FRONTEND_URL` falsch | Public URL setzen |
