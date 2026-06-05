# Anlage: Technische und organisatorische Maßnahmen (TOMs)

## 1. Zutritts- und Zugangskontrolle
- JWT-basierte Authentifizierung, rollenbasierte Zugriffskontrolle (RBAC)
- Passwortrichtlinie: min. 10 Zeichen, Komplexität, Admin-Reset-Links (1h gültig)
- Login-Rate-Limiting (5 Versuche/Minute)
- Kein öffentlicher Zugriff auf hochgeladene Dokumente (auth-gated downloads)

## 2. Weitergabe- und Eingabekontrolle
- TLS-Verschlüsselung in Transit
- CORS auf bekannte Frontend-Origins beschränkt
- Validierung aller API-Eingaben (class-validator)

## 3. Auftragskontrolle
- Mandantentrennung (Phase 4: tenantId); aktuell: Deployment pro Kunde
- Audit-Protokoll für sensible Aktionen (Login, Export, Löschung, Dokument-Download)

## 4. Verfügbarkeits- und Belastungskontrolle
- Automatische DB-Backups (Betriebsdokumentation des Hosting-Anbieters)
- Health-Checks und Monitoring (in Einrichtung)

## 5. Trennungskontrolle
- Logische Trennung der Kundendaten (Single-Tenant-Deployment oder Multi-Tenant mit tenantId)
- Keine gemeinsame Nutzer-Datenbank über Kunden hinweg in Produktion

## 6. Datenschutz-Management
- DSGVO-Export (Art. 15) und Anonymisierung (Art. 17) über Admin-API
- Automatische Löschung von Standortverlauf nach 90 Tagen
- AVV-Vorlage und Unterauftragsverarbeiter-Liste dokumentiert

## 7. Incident Response
- Meldung von Datenschutzverletzungen an Auftraggeber innerhalb 24h (gemäß AVV)
- Audit-Logs zur Forensik verfügbar
