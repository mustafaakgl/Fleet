# Same-Week Onboarding Playbook

**Ziel:** Neuer Kunde nach Vertragsunterschrift innerhalb von 3 Werktagen live.

---

## Rollen

| Rolle | Verantwortung |
|-------|---------------|
| **Vertrieb** | Vertrag + AVV, Kick-off-Termin |
| **Fleet-Ops** | Tenant, SMTP, erster Admin |
| **Kunde (Admin)** | CSV-Import, Team einladen |
| **Customer Success** | Review-Call Tag 5 |

---

## Tag 0 — Vertragsabschluss (Montag)

- [ ] AVV + Vertrag unterschrieben
- [ ] `DATA_CONTROLLER_NAME` und Kontakt-E-Mail für Tenant notiert
- [ ] SMTP in Prod aktiv — siehe `docs/ops/SMTP-GO-LIVE.md` (`npm run verify:smtp`)

## Tag 1 — Provisionierung (Montag/Dienstag)

**Fleet-Ops:**

1. `/admin/tenants` (Fleet-Ops) — neuen Mandanten anlegen (siehe `docs/ops/FLEET-OPS-TENANT-PROVISIONING.md`)
2. Admin-Zugang an Kunden übermitteln (sicherer Kanal)
3. `GET /api/v1/mail/test` — SMTP-Test an Admin-E-Mail
4. Getting-Started-Checkliste mit Kunden teilen: `/getting-started`

**Kunde (Admin):**

1. Einloggen
2. Getting-Started öffnen
3. Firmenprofil vervollständigen (Kontakt-E-Mail)

## Tag 2 — Stammdaten (Dienstag)

**Kunde + Support (Screen-Share):**

1. Beispiel-CSV herunterladen: `/samples/drivers.csv`, `/samples/vehicles.csv`
2. CSV anpassen und unter `/import` hochladen
3. Disponenten + Buchhaltung einladen (Einsatzplan → Benutzerverwaltung)
4. Einladungs-E-Mail im Posteingang prüfen

## Tag 3 — Erster Einsatz (Mittwoch)

1. Unter `/assignments/new` ersten Einsatz anlegen
2. Optional: CompanyEmail-Tagesplan testen (`send` → echte E-Mail)
3. Fahrer-App: Check-in + Dokument-Upload testen

## Tag 4–5 — Review (Donnerstag/Freitag)

- [ ] 30-Min Review-Call
- [ ] Getting-Started: 5/5 Schritte grün
- [ ] Offene Fragen (DSGVO, Billing, Support)

---

## Checkliste „Go-Live bereit"

- [ ] SMTP: Invite + Reset + CompanyEmail → Inbox
- [ ] ≥1 Disponent eingeladen
- [ ] ≥2 Fahrer + ≥2 Fahrzeuge importiert
- [ ] ≥1 Einsatz geplant
- [ ] Admin hat Datenschutz-Seite gesehen

---

## Eskalation

| Problem | Lösung |
|---------|--------|
| E-Mail im Spam | SPF/DKIM prüfen, Absender `SMTP_FROM` |
| CSV-Fehler | Zeilennummer in Fehlermeldung, Beispiel-CSV vergleichen |
| Seat-Limit | Billing-Plan prüfen `/billing` |
