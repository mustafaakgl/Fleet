# DSGVO — FAQ für den Vertrieb (Live-Demo)

**Ziel:** In 5 Minuten Vertrauen aufbauen. Keine Überraschungen im Kundengespräch.

---

## 1. „Sind meine Daten sicher?“

**Kurzantwort:** Ja — Führerscheine, Pässe und andere Dokumente sind **nicht öffentlich** erreichbar. Nur eingeloggte, berechtigte Nutzer können Dateien über die API abrufen. Jeder Zugriff wird protokolliert.

**Live zeigen:**
1. Dokument in der App öffnen (z. B. Führerschein eines Fahrers).
2. URL kopieren → Inkognito-Fenster → **Zugriff verweigert** (404 oder 401).
3. Datenschutz → Audit-Log → Eintrag `document.download`.

---

## 2. „Haben Sie einen AVV (Auftragsverarbeitungsvertrag)?“

**Kurzantwort:** Ja. Wir stellen eine **deutsche AVV-Vorlage** (Art. 28 DSGVO) mit TOMs-Anlage und Unterauftragsverarbeiter-Liste bereit. Ihr Anwalt kann die Vorlage anpassen.

**Live zeigen:** Datenschutz-Seite → „AVV herunterladen“ + TOMs-Anlage.

**Dateien im Repo:** `docs/legal/AVV-Vorlage-DE.md`, `AVV-Anlage-TOMs.md`, `Unterauftragsverarbeiter.md`

---

## 3. „Wo werden die Daten gespeichert?“

**Kurzantwort:** In der EU (Hosting-Region konfigurierbar). Verschlüsselung in Transit (TLS) und at Rest (Datenbank/Storage). Keine öffentlichen Upload-URLs.

**Bei Rückfrage zu Sub-Prozessoren:** DeepL (Übersetzung Messenger), Hosting-Provider, Expo (Push) — siehe `Unterauftragsverarbeiter.md`.

---

## 4. „Was passiert bei Löschung (Art. 17)?“

**Kurzantwort:** Wir **anonymisieren** Personendaten des Fahrers. Einsatz- und Abrechnungsdaten bleiben aus handels- und steuerrechtlichen Gründen erhalten (bis zu 10 Jahre). Dokumente und Standortverlauf werden gelöscht.

**Live zeigen:** Fahrer-Detail → Gefahrenzone → Anonymisierung (nur Demo mit Testfahrer).

---

## 5. „Auskunft nach Art. 15?“

**Kurzantwort:** Admin kann einen **ZIP-Export** mit allen Daten des Fahrers erzeugen (JSON + Dokumente + Audit-Auszug).

**Live zeigen:** Fahrer-Detail → „Datenexport (DSGVO)“ → ZIP öffnen → `driver.json`, `documents/`.

---

## 6. „Standortdaten — tracken Sie heimlich?“

**Kurzantwort:** Nein. GPS nur mit **documentierter Einwilligung** (`locationTrackingConsentAt`). Fahrer startet/stoppt Sharing in der App. Kein Einsatz heute = kein Tracking.

**Live zeigen:** Export oder Fahrerprofil → Einwilligungszeitstempel.

---

## 7. „Wer in meinem Team sieht was?“

**Kurzantwort:** Rollenbasierter Zugriff: Admin, Chef, Disposition, Buchhaltung. Buchhaltung sieht keine Schreibzugriffe auf Stammdaten. `accounting` sieht Finanzfelder, aber kann keine Einsätze anlegen.

---

## Einwände & Antworten

| Einwand | Antwort |
|---------|---------|
| „Wir brauchen ISO 27001.“ | „TOMs dokumentiert; ISO-Zertifizierung ist auf der Roadmap nach ersten zahlenden Kunden.“ |
| „Pen-Test?“ | „OWASP-Checklist + interne Tests; formales Pentest vor Enterprise-Kunden.“ |
| „Single-Tenant?“ | „Multi-Tenant-SaaS — jeder Kunde isoliert per `tenantId`.“ |
| „Was wenn ihr insolvent werdet?“ | „AVV regelt Datenrückgabe/Löschung; Export jederzeit möglich.“ |

---

## Checkliste vor dem Kundentermin

- [ ] `DATA_CONTROLLER_NAME` / Firmenname in Demo korrekt
- [ ] Testdokument hochgeladen (Führerschein)
- [ ] Admin-Login funktioniert
- [ ] AVV-PDF im Sales-Ordner
- [ ] Backend läuft, `/uploads` gibt 404
