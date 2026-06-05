# Datenaufbewahrung — MyFleet

| Datenkategorie | Aufbewahrungsfrist | Rechtsgrundlage / Zweck |
|---|---|---|
| Fahrer-Stammdaten (aktiv) | Dauer des Arbeits-/Einsatzverhältnisses | Art. 6 Abs. 1 lit. b DSGVO |
| Anonymisierte Fahrer (Einsätze) | 10 Jahre nach Anonymisierung | Handels-/Steuerrecht (§ 147 AO, § 257 HGB) |
| Einsatz-/Abrechnungsdaten (Assignments) | 10 Jahre | Handels-/Steuerrecht |
| Dokumente (Führerschein, TÜV, etc.) | Bis Ablauf + 1 Jahr | Compliance-Nachweis |
| Standortverlauf (GPS History) | 90 Tage (konfigurierbar) | Einwilligung; betriebliche Notwendigkeit |
| Standort-Snapshot (Latest) | Solange Einsatz aktiv | Live-Disposition |
| Audit-Protokolle | 2 Jahre | Rechenschaftspflicht Art. 5 Abs. 2 DSGVO |
| Messenger-Nachrichten | 2 Jahre | Betriebliche Kommunikation |
| Vertrags-/AVV-Unterlagen | 3 Jahre nach Vertragsende | Handelsrecht |

Technische Umsetzung:
- Standortverlauf: automatische Löschung via `PrivacyRetentionJob` (täglich 03:00 Europe/Berlin)
- Konfiguration: `LOCATION_HISTORY_RETENTION_DAYS` (Standard: 90)
