# Launch E2E Rehearsal — Demo → Onboard → Pay

**Ziel:** Einmal komplett durchspielen bevor der erste zahlende Kunde live geht.  
**Dauer:** ~90 Minuten  
**Teilnehmer:** Vertrieb, Fleet-Ops, Engineering

---

## Vorbereitung (T-1)

```bash
./scripts/launch-preflight.sh
cd backend && npm run verify:smtp && npm run verify:s3 && npm run verify:stripe
```

- [ ] Staging/Prod `.env` vollständig (`.env.production.example`)
- [ ] Test-Tenant oder frischer Kunde vorbereitet
- [ ] Stripe Test/Live Modus bekannt

---

## Akt 1 — DSGVO-Demo (15 Min) — Vertrieb

| # | Schritt | Erwartung |
|---|---------|-----------|
| 1 | Fahrer-Dokument öffnen | JWT-geschützt |
| 2 | URL kopieren → Inkognito | **Zugriff verweigert** |
| 3 | Datenschutz → Audit-Log | `document.download` sichtbar |
| 4 | Fahrer-Export ZIP | Download OK |
| 5 | AVV + TOMs Download | PDF/MD verfügbar |

**Pass:** 5/5 ohne Fehler

---

## Akt 2 — Same-Week Onboarding (30 Min) — Ops + Kunde

| # | Schritt | Erwartung |
|---|---------|-----------|
| 1 | Admin-Login | Dashboard lädt |
| 2 | `/getting-started` | Checkliste sichtbar |
| 3 | Kontakt-E-Mail speichern | Schritt 1 grün |
| 4 | SMTP-Test | Inbox oder log mode dokumentiert |
| 5 | CSV Import (`/import`) | ≥2 Fahrer, ≥2 Fahrzeuge |
| 6 | Disponent einladen | E-Mail + Accept-Flow |
| 7 | Erster Einsatz (`/assignments/new`) | Gespeichert |
| 8 | Getting-Started 5/5 | `complete: true` |

**Pass:** Kunde in <3 Tagen simulierbar

---

## Akt 3 — Billing (20 Min) — Admin

| # | Schritt | Erwartung |
|---|---------|-----------|
| 1 | `/billing` | Pläne DE, SEPA-Hinweis |
| 2 | Checkout starten | Stripe DE, USt-IdNr.-Feld |
| 3 | SEPA-Mandat / Testkarte | `checkout=success` |
| 4 | Stripe Dashboard | Subscription active |
| 5 | Rechnungs-PDF | DE, per E-Mail |
| 6 | Webhook | `tenant_subscription` status `active` |

**Pass:** Geldfluss nachvollziehbar

---

## Akt 4 — Ops & Security (15 Min) — Engineering

| # | Check | Befehl / Ort |
|---|-------|--------------|
| 1 | Health ready | `curl .../health/ready` → storage+smtp ok |
| 2 | Metrics geschützt | ohne Token → 401 |
| 3 | Backup Cron | letztes `fleet-db-*.sql.gz` < 24 h |
| 4 | Sentry | Test-Event sichtbar |
| 5 | Pentest Checklist | `docs/security/PENTEST-CHECKLIST.md` sign-off |

---

## Akt 5 — Go / No-Go (10 Min)

| Kriterium | Go | No-Go |
|-----------|-----|-------|
| DSGVO Demo 5/5 | ✅ | ❌ |
| Onboarding 5/5 | ✅ | ❌ |
| SEPA-Zahlung | ✅ | ❌ |
| SMTP Inbox | ✅ | ❌ |
| Backup + Health | ✅ | ❌ |
| Offene P0 Bugs | 0 | ≥1 |

**Entscheidung:** _______________ **Datum:** _______________

---

## Rollback-Plan

1. Maintenance-Modus / Traffic stoppen
2. DB-Restore aus letztem Backup
3. Stripe Subscription pausieren (Support)
4. Kundenkommunikation über `support@`
