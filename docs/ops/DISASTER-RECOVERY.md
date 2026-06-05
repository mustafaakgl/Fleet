# Disaster Recovery Runbook — MyFleet

## Targets

| Metric | Target |
|--------|--------|
| **RPO** (max data loss) | ≤ 24 hours |
| **RTO** (max downtime) | ≤ 4 hours |

## Components

| Component | Backup | Restore |
|-----------|--------|---------|
| PostgreSQL | `scripts/backup-daily.sh` → `backups/fleet-db-*.sql.gz` | `gunzip -c file.sql.gz \| psql $DATABASE_URL` |
| Upload files (local) | `fleet-uploads-*.tar.gz` | Extract to `backend/uploads/` |
| Upload files (S3) | S3 versioning / provider backup | Restore object version or replica bucket |
| Secrets | Password manager / K8s secrets | Re-inject env vars |

## Daily backup (cron example)

```cron
0 2 * * * cd /opt/fleet && DATABASE_URL='...' ./scripts/backup-daily.sh >> /var/log/fleet-backup.log 2>&1
```

Set `BACKUP_DIR` to encrypted volume or sync to off-site (e.g. `rclone` to B2/S3).

## Restore procedure

1. **Announce** incident channel; freeze writes (maintenance mode or scale API to 0).
2. **Provision** fresh Postgres (or wipe and recreate database).
3. **Restore DB**: latest `fleet-db-*.sql.gz` into `DATABASE_URL`.
4. **Restore files**: extract uploads archive OR verify S3 bucket integrity.
5. **Run migrations**: `npx prisma migrate deploy` (idempotent).
6. **Smoke test**: `/api/v1/health/ready`, login, open document, list drivers.
7. **Resume** traffic; monitor Sentry + Prometheus for 1 hour.

## Partial failures

| Scenario | Action |
|----------|--------|
| DB corrupt, files OK | DB restore only |
| Files lost, DB OK | Restore uploads from backup; documents may 404 until restored |
| Single AZ outage | Failover to standby region (provider-specific) |
| Stripe webhook backlog | Replay events from Stripe Dashboard |

## Contacts

- On-call engineering: _[fill]_
- Hosting provider support: _[fill]_
- DPA / customer notification (72h breach): legal@…

## Test schedule

- **Quarterly**: restore to staging from latest backup
- **Annual**: full DR tabletop exercise
