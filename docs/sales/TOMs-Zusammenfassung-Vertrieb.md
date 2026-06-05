# Technische und organisatorische Maßnahmen (TOMs) — Kurzfassung für Kunden

**MyFleet / Fleet SaaS** · Stand: Juni 2026 · Anlage zum AVV

---

## 1. Zugangskontrolle

- JWT-Authentifizierung, Passwort-Policy (min. 10 Zeichen)
- Login Rate-Limiting gegen Brute-Force
- Rollenbasierte Zugriffe (RBAC): Admin, Chef, Disposition, Buchhaltung, Fahrer
- Multi-Tenant-Isolation: jeder Mandant sieht nur eigene Daten

## 2. Zutritts- und Zugangskontrolle (System)

- Hosting in EU-Rechenzentrum (konfigurierbar)
- TLS für alle API-Verbindungen
- Keine öffentlichen Datei-URLs (`/uploads` deaktiviert)
- Auth-gated Downloads mit Audit-Protokoll

## 3. Weitergabekontrolle

- API nur mit gültigem Token
- CORS auf bekannte Frontend-Origins beschränkt
- DSGVO-Export nur für Admins
- Anonymisierung mit Audit-Trail

## 4. Eingabekontrolle

- Audit-Log für CRUD auf Stammdaten, Dokument-Downloads, Datenschutz-Aktionen
- Tenant-scoped Audit-Einträge
- Aufbewahrung Audit-Logs: 2 Jahre (automatische Bereinigung)

## 5. Auftragskontrolle

- AVV-Vorlage nach Art. 28 DSGVO
- Dokumentierte Unterauftragsverarbeiter
- Mandantentrennung in Datenbank (Prisma Extension)

## 6. Verfügbarkeit und Belastbarkeit

- Health-Checks (`/health`, `/health/ready`)
- Tägliches Backup (Datenbank + Uploads)
- Disaster-Recovery-Dokumentation
- Graceful Shutdown

## 7. Trennungsgebot

- `tenantId` auf allen operativen Tabellen
- CI-Test: Tenant-Isolation
- Cross-Tenant-Zugriff technisch blockiert

## 8. Datenminimierung & Löschkonzept

- Standortverlauf: 90 Tage (konfigurierbar)
- Messenger-Nachrichten: 2 Jahre
- Benachrichtigungen: 2 Jahre
- Abgelaufene Dokumente: Löschung nach Karenzzeit
- Fahrer-Anonymisierung: PII entfernt, Einsätze anonymisiert retained

## 9. Incident Response

- Sentry (optional) für Fehler-Monitoring
- Strukturiertes JSON-Request-Logging
- Kontakt: privacy@[DOMAIN] für Datenschutzvorfälle

---

**Hinweis:** Vollständige TOMs siehe `docs/legal/AVV-Anlage-TOMs.md`. Diese Kurzfassung dient der Vertriebskommunikation — rechtlich bindend ist der unterzeichnete AVV.
