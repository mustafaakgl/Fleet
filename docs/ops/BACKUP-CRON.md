# Backup Cron — Production

## Ziele

| Metrik | Ziel |
|--------|------|
| RPO | ≤ 24 h |
| Aufbewahrung | 14 Tage (konfigurierbar) |

---

## 1. Tägliches DB-Backup

```cron
# /etc/cron.d/fleet-backup — täglich 02:00 UTC
0 2 * * * fleet cd /opt/fleet && DATABASE_URL='postgresql://...' BACKUP_DIR=/var/backups/fleet ./scripts/backup-daily.sh >> /var/log/fleet-backup.log 2>&1
```

Variablen:

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `DATABASE_URL` | — | **Pflicht** |
| `BACKUP_DIR` | `./backups` | Zielverzeichnis (verschlüsseltes Volume) |
| `BACKUP_RETENTION_DAYS` | `14` | Alte Backups löschen |

Output:

- `fleet-db-YYYYMMDDTHHMMSSZ.sql.gz`
- `fleet-uploads-*.tar.gz` (nur bei `STORAGE_DRIVER=local`)

---

## 2. S3-Modus

Bei `STORAGE_DRIVER=s3` sichert das Skript **nur PostgreSQL**. Dateien liegen im S3-Bucket:

1. **Versioning** am Bucket aktivieren
2. Optional: Lifecycle → Glacier nach 90 Tagen
3. Optional: `rclone sync` Bucket → Offsite:

```cron
30 2 * * * fleet rclone sync s3:fleet-uploads-prod b2:fleet-backup/uploads --fast-list >> /var/log/fleet-s3-backup.log 2>&1
```

---

## 3. Offsite-Sync (empfohlen)

```bash
# Beispiel: Backups nach S3/B2 hochladen
rclone copy /var/backups/fleet remote:fleet-db-backups --max-age 24h
```

---

## 4. Restore-Test (quartalsweise)

```bash
gunzip -c backups/fleet-db-LATEST.sql.gz | psql "$STAGING_DATABASE_URL"
curl -s "$STAGING_API/api/v1/health/ready"
```

Siehe `docs/ops/DISASTER-RECOVERY.md`.

---

## 5. Monitoring

- Cron-Exit-Code in Log prüfen
- Alert wenn kein `fleet-db-*.sql.gz` in 26 h erstellt wurde
- Sentry/Metrics: Backup-Fehler manuell loggen (optional externes Monitoring)
