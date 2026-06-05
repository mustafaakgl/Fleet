# Fleet — Commercial Launch Roadmap (Sales-Critical)

**Ziel:** Ersten zahlenden deutschen Kunden (€300/Monat) in derselben Woche nach dem Demo onboarden — ohne DSGVO-Überraschungen, ohne Developer-Seed, mit echter E-Mail und SEPA.

**Stand:** Juni 2026 — nach Phase 0–6 (technische Basis). Dieses Dokument fokussiert auf die **verbleibenden Lücken für den Vertrieb**.

---

## Schwächen-Audit: damals vs. heute

| # | Ursprüngliche Schwäche | Heute | Verbleibend für Launch |
|---|------------------------|-------|------------------------|
| 1 | Single-tenant, kein SaaS | ✅ Multi-tenant (Phase 4) | Prod-Migration + 2. Test-Tenant in CI |
| 2 | Kein Billing / Signup / Invitations | ✅ Stripe-Modul, Onboarding, Invites (Phase 2–3) | Stripe Live + SEPA testen; Admin-Onboarding polieren |
| 3 | GDPR — öffentliche `/uploads` PII | 🟡 Static serving entfernt; API-Download | Frontend vollständig migrieren; Demo-Script QA |
| 4 | Demoware in Prod-Nav | ✅ Phase 0 | — |
| 5 | Security immature | 🟡 JWT, Rate-Limit, Reset, RBAC | MFA fehlt; Prod-Secrets; Pentest-Checklist abarbeiten |
| 6 | E-Mail sendet nicht | 🟡 `MailService` da, `SMTP_ENABLED=false` | SMTP prod + CompanyEmail + Invite E2E |
| 7 | Assignment Create-Flow kaputt | ✅ Phase 0 | — |

**Legende:** ✅ erledigt · 🟡 teilweise · ❌ offen

---

## Die drei Säulen (Vertriebs-Prioritäten)

```
Woche 1–2          Woche 2–3          Woche 3–4
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ 1. DSGVO/   │    │ 2. Schnelles│    │ 3. Deutsch  │
│    AVV      │───▶│  Onboarding │───▶│  Billing +  │
│ (Vertrauen) │    │ (Same Week) │    │  Support    │
└─────────────┘    └─────────────┘    └─────────────┘
        │                  │                  │
        └──────────────────┴──────────────────┘
                    Querschnitt:
              E-Mail live · Security · Ops
```

---

## Säule 1 — DSGVO/AVV: „Sind meine Daten sicher?“

> **Sales-Risiko:** Filo sahibi ehliyet/pasaport yükler. Toplantıda *„AVV var mı? Veriler güvende mi?“* sorusu **kesin** gelir.

### 1.1 Dateizugriff — keine öffentlichen URLs mehr (BLOCKER)

| # | Aufgabe | Status | Akzeptanzkriterium |
|---|---------|--------|-------------------|
| 1.1.1 | `app.useStaticAssets('/uploads')` entfernt | ✅ | `curl /uploads/...` → 404 |
| 1.1.2 | Auth-gated Download API (`/documents/:id/download`, `/vehicles/:id/photo`) | ✅ | Postman mit JWT → Datei |
| 1.1.3 | Download-Audit (`document.download`, `vehicle_photo.download`) | ✅ | Jeder Download in Audit-Log sichtbar |
| 1.1.4 | Owner-Autorisierung (Fahrer sieht nur eigene Docs) | ✅ | Driver + operational roles in `assertCanDownloadDocument` |
| 1.1.5 | Frontend: **kein** direkter `/uploads`-Link mehr | ✅ | `resolveAssetUrl` blockiert `/uploads`; Detailseiten nutzen `DocumentFileLink` |
| 1.1.6 | `VehiclePlateDisplay` + Detailseiten → `useAuthenticatedImageUrl` | ✅ | Foto nur eingeloggt sichtbar |
| 1.1.7 | API-Responses: `download_url` statt `fileUrl` exposen | ✅ | `mapDocumentToClient` maskiert `fileUrl` |
| 1.1.8 | Driver Mobile (Expo): JWT auf allen File-Fetches | ✅ | `AuthenticatedImage` + `download_url` |

**Demo-Script (5 Min — Sales-Training):**

1. *„Ihr Führerschein ist nicht öffentlich.“* — Dokument öffnen → URL kopieren → Inkognito → **Zugriff verweigert**.
2. *„Wir protokollieren Zugriffe.“* — Datenschutz → Audit → `document.download`.
3. *„Auskunft Art. 15.“* — Fahrer-Detail → Datenexport → ZIP.
4. *„Löschung Art. 17.“* — Anonymisierung (Einsätze bleiben für Buchführung).
5. *„Standort nur mit Einwilligung.“* — `locationTrackingConsentAt` im Export.

**Aufwand:** ~2–3 Dev-Tage

---

### 1.2 AVV & Vertragsunterlagen (Sales-Asset)

| # | Aufgabe | Status | Akzeptanzkriterium |
|---|---------|--------|-------------------|
| 1.2.1 | `docs/legal/AVV-Vorlage-DE.md` | ✅ | Im Repo |
| 1.2.2 | `docs/legal/AVV-Anlage-TOMs.md` | ✅ | TOMs dokumentiert |
| 1.2.3 | `docs/legal/Unterauftragsverarbeiter.md` | ✅ | Sub-Prozessoren gelistet |
| 1.2.4 | In-App Download auf `/privacy` | ✅ | „AVV herunterladen“ |
| 1.2.5 | **1-Seiten TOMs-Zusammenfassung** für Vertrieb | ✅ | `docs/sales/TOMs-Zusammenfassung-Vertrieb.md` (+ In-App Download) |
| 1.2.6 | `[FIRMENNAME]` → `DATA_CONTROLLER_NAME` env | ✅ | `NEXT_PUBLIC_DATA_CONTROLLER_NAME` in `.env.example` |
| 1.2.7 | Anwalts-Review vor erster Unterschrift | ❌ | Extern |
| 1.2.8 | **Sales-Cheat-Sheet** DE: häufige DSGVO-Fragen | ✅ | `docs/sales/DSGVO-FAQ-Vertrieb.md` |

**AVV-Gesprächsleitfaden:**

| Kundenfrage | Kurzantwort |
|-------------|-------------|
| „Haben Sie einen AVV?“ | „Ja — Vorlage Art. 28 DSGVO, TOMs-Anlage, Unterauftragsverarbeiter. Ihr Anwalt passt an.“ |
| „Wo liegen die Daten?“ | „EU-Region, Verschlüsselung in Transit + at Rest.“ |
| „Wer sieht Führerscheine?“ | „Nur autorisierte Rollen — jeder Zugriff protokolliert.“ |
| „Was bei Vertragsende?“ | „Löschung/Anonymisierung nach AVV + gesetzliche Aufbewahrung.“ |

**Aufwand:** ~1 Dev-Tag + Legal Review (extern)

---

### 1.3 Datenschutz-Seite & Retention

| # | Aufgabe | Status |
|---|---------|--------|
| 1.3.1 | `/privacy` + `/datenschutz` | ✅ |
| 1.3.2 | Export + Anonymisierung API | ✅ |
| 1.3.3 | Retention-Cron | ✅ |
| 1.3.4 | Retention-Tabelle in UI verlinkt | 🟡 |
| 1.3.5 | Demo-Script E2E QA | ❌ |

---

## Säule 2 — Schnelles manuelles Onboarding (Same Week)

> Demo gut → „Ja“ → Kunde **dieselbe Woche** live. Kein Developer-Seed.

### 2.1 Admin-gesteuerte Kundenanlage

| # | Aufgabe | Status | Akzeptanzkriterium |
|---|---------|--------|-------------------|
| 2.1.1 | `POST /onboarding/setup` | ✅ | Tenant in <2 Min |
| 2.1.2 | Onboarding-UI `/onboarding` | ✅ | Formular DE |
| 2.1.3 | **Super-Admin**: Fleet-Ops legt Tenant an | 🟡 | `docs/ops/SAME-WEEK-ONBOARDING-PLAYBOOK.md` |
| 2.1.4 | Tenant-Settings (Name, Kontakt, Sprache) | ✅ | `PATCH /onboarding/tenant` + Getting-Started |
| 2.1.5 | Onboarding-Checkliste UI (5 Schritte) | ✅ | `/getting-started` + `GET /onboarding/progress` |

**Same-Week Playbook:**

| Tag | Aktion | Wer |
|-----|--------|-----|
| Mo | Vertrag + AVV unterschrieben | Vertrieb |
| Mo | Tenant + Admin-Einladung | Fleet-Ops |
| Di | CSV Fahrer/Fahrzeuge + Disponenten einladen | Kunde + Support |
| Mi | Erster Einsatzplan | Disponent |
| Do | Fahrer-App Test (Check-in, Dokument) | Kunde |
| Fr | 30-Min Review-Call | Customer Success |

**Aufwand:** ~2–3 Dev-Tage (Wizard + Super-Admin)

---

### 2.2 Einladungen & Benutzerverwaltung

| # | Aufgabe | Status |
|---|---------|--------|
| 2.2.1 | Invitations API + Accept-Flow | ✅ |
| 2.2.2 | Einladungs-E-Mail (SMTP) | ✅ Code · 🟡 Prod SMTP |
| 2.2.3 | Seat-Limits bei Invite | ✅ |
| 2.2.4 | Benutzerverwaltung → `usersApi` | ✅ |

---

### 2.3 CSV-Import

| # | Aufgabe | Status |
|---|---------|--------|
| 2.3.1 | Import API drivers/vehicles | ✅ |
| 2.3.2 | Import-UI `/import` | ✅ |
| 2.3.3 | DE Fehlermeldungen + Beispiel-CSV | ✅ | `/samples/*.csv` + Download in `/import` |
| 2.3.4 | Import-Audit + Throttle | ✅ |

**Aufwand:** ~1 Dev-Tag

---

## Säule 3 — Deutsch + Abrechnung (Geld kassieren)

> Ohne SEPA, deutsche Rechnung und deutschen Support kein €300/Monat.

### 3.1 Stripe Billing + SEPA

| # | Aufgabe | Status | Akzeptanzkriterium |
|---|---------|--------|-------------------|
| 3.1.1 | Stripe Checkout + Portal | ✅ | Code vorhanden |
| 3.1.2 | Pläne Basic/Pro/Enterprise | ✅ | |
| 3.1.3 | SEPA Lastschrift (Stripe) | ✅ Code · 🟡 Live-Test | `sepa_debit` + DE Checkout |
| 3.1.4 | Vehicle/Seat Limits | ✅ | |
| 3.1.5 | Manual-Invoice Fallback | ✅ | |
| 3.1.6 | `/billing` UI (DE) | ✅ | |
| 3.1.7 | Deutsche Rechnungs-PDF (Stripe DE) | ✅ Code · 🟡 Stripe-Konto | `invoice_creation` + Portal `locale: de` |
| 3.1.8 | USt-IdNr. im B2B Checkout | ✅ | `tax_id_collection.required: if_supported` |
| 3.1.9 | Webhook Prod | ✅ Code · 🟡 Live-Endpoint | `docs/ops/STRIPE-GO-LIVE.md` |

**Aufwand:** ~2 Dev-Tage + Stripe Live Setup

---

### 3.2 Deutscher Support-Kanal

| # | Aufgabe | Status |
|---|---------|--------|
| 3.2.1 | UI-Sprache DE primär | ✅ |
| 3.2.2 | Support-Kontakt in App (E-Mail + Zeiten) | ✅ | `/hilfe` + `NEXT_PUBLIC_SUPPORT_*` |
| 3.2.3 | Hilfe/FAQ Seite (DE) | ✅ | `/hilfe` |
| 3.2.4 | `support@myfleet.app` Mailbox + SLA | ❌ Ops |
| 3.2.5 | „Hilfe“ Link im Header/Footer | ✅ | Sidebar + Header |

**Aufwand:** ~1–2 Dev-Tage + Ops Mailbox

---

## Querschnitt — E-Mail wirklich senden (BLOCKER)

> Heute: `SMTP_ENABLED=false` → nur Log-Output.

| # | Flow | Code | SMTP Prod |
|---|------|------|-----------|
| Q.1 | Einladungs-E-Mail | ✅ | ❌ |
| Q.2 | Passwort-Reset | ✅ | ❌ |
| Q.3 | CompanyEmail Tagesplan | ✅ | ❌ |
| Q.4 | Billing-Rechnung (Stripe) | Stripe | ❌ |
| Q.5 | Willkommens-E-Mail Onboarding | ✅ | ❌ |

### E-Mail Go-Live Checkliste

- [ ] SMTP-Provider (Postmark/SendGrid/Mailgun EU) — **extern: Konto + API-Key**
- [ ] SPF + DKIM + DMARC für Domain — **extern: DNS** (`scripts/check-email-dns.sh`)
- [x] `SMTP_ENABLED=true` Prod erzwungen (`env.validation.ts` + `docker-compose.prod.yml`)
- [x] SMTP-Verifikation (`npm run verify:smtp` + `/health/ready` checks.smtp)
- [ ] Test: Invite → Inbox (nicht Spam) — nach Provider-Setup
- [ ] Test: CompanyEmail send — nach Provider-Setup
- [ ] Test: Passwort-Reset Link — nach Provider-Setup
- [x] DE E-Mail-Templates (`backend/src/mail/mail-templates.ts`)
- [x] SMTP-Test-Endpoint (`POST /api/v1/mail/test`)
- [ ] Bounce-Monitoring

**Aufwand:** ~2 Dev-Tage + 1 Ops-Tag (DNS)

---

## Querschnitt — Sicherheitsreife

| # | Maßnahme | Status | Launch-kritisch? |
|---|----------|--------|------------------|
| S.1 | JWT Prod-Validierung | ✅ | Ja |
| S.2 | Login Rate-Limit | ✅ | Ja |
| S.3 | Passwort-Policy | ✅ | Ja |
| S.4 | RBAC + WriteRoleGuard | ✅ | Ja |
| S.5 | Audit CRUD | ✅ | Ja |
| S.6 | Multi-Tenant | ✅ | Ja |
| S.7 | S3/MinIO Prod | 🟡 | Ja |
| S.8 | Backup Cron | 🟡 | Ja |
| S.9 | Sentry | 🟡 | Empfohlen |
| S.10 | MFA / 2FA | ❌ | Post-launch |
| S.11 | Virus-Scan | ❌ | Post-revenue |
| S.12 | Pentest Checklist | 🟡 | Vor Enterprise |

---

## 4-Wochen-Zeitplan

### Woche 1: Vertrauen (DSGVO + Dateien)
| Tag | Fokus | Deliverable |
|-----|-------|-------------|
| Mo–Di | Frontend File-Migration (1.1) | Kein `/uploads` in UI |
| Mi | Driver Mobile JWT (1.1.8) | Expo sicher |
| Do | AVV PDF + Sales FAQ (1.2) | Sales-Ordner komplett |
| Fr | Demo-Script QA (1.3.5) | Probe-Demo Vertrieb |

### Woche 2: E-Mail + Onboarding
| Tag | Fokus | Deliverable |
|-----|-------|-------------|
| Mo–Di | SMTP Prod + DE Templates | E-Mail live |
| Mi–Do | Onboarding-Wizard (2.1.5) | 5-Schritte UI |
| Fr | CSV-Beispiel + Playbook Dry-Run | Ops getestet |

### Woche 3: Billing + Deutsch
| Tag | Fokus | Deliverable |
|-----|-------|-------------|
| Mo–Di | Stripe Live + SEPA | Testzahlung |
| Mi | USt-IdNr. + DE Rechnung | B2B Checkout |
| Do–Fr | Hilfe-Seite + Support | DE Support sichtbar |

### Woche 4: Hardening + Launch
| Tag | Fokus | Deliverable |
|-----|-------|-------------|
| Mo | S3 + Backup Cron | Ops Runbook |
| Di | Pentest Checklist | Sign-off |
| Mi | Sentry + Metrics Prod | Observability |
| Do | E2E: Demo → Onboard → Pay | Rehearsal |
| Fr | **Go / No-Go** | First Customer Ready |

---

## Definition of Done — Commercial Launch

- [ ] DSGVO Demo-Script 5/5 ohne Fehler
- [ ] AVV + TOMs PDF für Vertrieb
- [ ] Kein unauthentifizierter Dateizugriff (Web + Mobile)
- [ ] SMTP: Invite + CompanyEmail + Reset → echte Inbox
- [ ] Neuer Kunde in <3 Tagen onboarded
- [ ] Stripe SEPA Testzahlung
- [ ] Deutsche Rechnung an Testkunde
- [ ] Support-E-Mail + Hilfe-Seite live
- [ ] Prod: Backup + Sentry + Health

---

## Bewusst NICHT vor Launch

Self-Serve Signup · MFA · Virus-Scan · AI Features · Telematik-Hardware · Cookie-Banner · formales Pentest durch Dritte

---

## Nächster Schritt

**Woche 1 mit 1.1 (Datei-Migration) starten** — einziger verbleibender BLOCKER für die garantierte DSGVO-Demo-Frage.

```bash
grep -r "/uploads" frontend/app frontend/components --include="*.tsx"
curl -I http://localhost:3000/uploads/documents/test.pdf  # muss 404 sein
```
