# S3 Go-Live — Object Storage (Production)

Fleet **requires** `STORAGE_DRIVER=s3` in production. Local disk uploads are blocked at boot.

---

## 1. Bucket anlegen (EU)

| Provider | Region | Hinweis |
|----------|--------|---------|
| AWS S3 | `eu-central-1` | Versioning aktivieren |
| Hetzner Object Storage | `fsn1` / `nbg1` | S3-kompatibel |
| MinIO (self-hosted) | — | `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE=true` |

**Bucket-Policy:** Kein öffentlicher Lesezugriff. Alle Downloads über JWT-gesicherte API.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::YOUR_BUCKET/*",
      "Condition": { "Bool": { "aws:SecureTransport": "false" } }
    }
  ]
}
```

Aktivieren: **Bucket Versioning** (Datei-Wiederherstellung).

---

## 2. Backend `.env`

```env
STORAGE_DRIVER=s3
S3_BUCKET=fleet-uploads-prod
S3_REGION=eu-central-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
# MinIO only:
# S3_ENDPOINT=https://minio.example.com
# S3_FORCE_PATH_STYLE=true
```

---

## 3. Verifikation

```bash
cd backend && npm run verify:s3
curl -s https://api.myfleet.app/api/v1/health/ready | jq '.checks.storage'
# "ok"
```

---

## 4. Migration von Local → S3

1. Wartungsfenster (kurz)
2. Bestehende Dateien: `backend/uploads/` → `aws s3 sync backend/uploads/ s3://BUCKET/documents/` (Pfadstruktur: `documents/` + `vehicle-photos/`)
3. `STORAGE_DRIVER=s3` setzen, Backend neu starten
4. Smoke: Dokument öffnen, Fahrzeugfoto anzeigen

Neue Uploads gehen automatisch nach S3 (`ObjectStorageService.syncLocalFile`).

---

## 5. Backup

- **DB:** `scripts/backup-daily.sh` (täglich)
- **S3:** Versioning + optional Cross-Region Replication
- Siehe `docs/ops/BACKUP-CRON.md`
