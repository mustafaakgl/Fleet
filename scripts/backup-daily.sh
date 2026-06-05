#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

DB_FILE="$BACKUP_DIR/fleet-db-$TIMESTAMP.sql.gz"
UPLOADS_FILE="$BACKUP_DIR/fleet-uploads-$TIMESTAMP.tar.gz"

echo "Backing up database to $DB_FILE"
pg_dump "$DATABASE_URL" | gzip -9 > "$DB_FILE"

STORAGE_DRIVER="${STORAGE_DRIVER:-local}"
if [[ "$STORAGE_DRIVER" == "s3" ]]; then
  echo "STORAGE_DRIVER=s3 — skipping local uploads archive (use S3 versioning; see docs/ops/BACKUP-CRON.md)"
elif [[ -d "$ROOT_DIR/backend/uploads" ]]; then
  echo "Backing up uploads to $UPLOADS_FILE"
  tar -czf "$UPLOADS_FILE" -C "$ROOT_DIR/backend" uploads
else
  echo "No local uploads directory — skipping file archive"
fi

find "$BACKUP_DIR" -type f -name 'fleet-db-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name 'fleet-uploads-*.tar.gz' -mtime +"$RETENTION_DAYS" -delete

echo "Backup complete: $TIMESTAMP"
