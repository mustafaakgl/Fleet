# Observability — Production

## Health Endpoints

| Endpoint | Zweck | Auth |
|----------|-------|------|
| `GET /api/v1/health` | Liveness | Öffentlich |
| `GET /api/v1/health/ready` | DB + SMTP + S3 + Sentry-Flag | Öffentlich |

Readiness-Response:

```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "smtp": "ok",
    "storage": "ok",
    "sentry": "ok"
  }
}
```

Kubernetes: Liveness → `/health`, Readiness → `/health/ready`.

---

## Prometheus Metrics

`GET /api/v1/metrics`

**Production:** Bearer-Token erforderlich:

```bash
curl -H "Authorization: Bearer $METRICS_TOKEN" https://api.myfleet.app/api/v1/metrics
```

`.env`:

```env
METRICS_TOKEN=<openssl rand -hex 32>
```

Prometheus `scrape_config`:

```yaml
- job_name: fleet-api
  bearer_token: <METRICS_TOKEN>
  metrics_path: /api/v1/metrics
  static_configs:
    - targets: ['api.myfleet.app']
```

Metriken: `fleet_http_requests_total`, `fleet_http_request_duration_seconds`, Node defaults.

---

## Sentry

```env
SENTRY_DSN=https://...@sentry.io/...
SENTRY_RELEASE=fleet@1.0.0
SENTRY_TRACES_SAMPLE_RATE=0.1
```

Frontend (optional):

```env
NEXT_PUBLIC_SENTRY_DSN=...
```

Verify: absichtlicher Test-Fehler → Event in Sentry Dashboard.

---

## Alerts (Minimum)

| Signal | Schwelle | Aktion |
|--------|----------|--------|
| `/health/ready` ≠ ok | 2 min | Pager |
| 5xx rate | > 1% / 5 min | Slack |
| Backup log | kein Erfolg 26 h | E-Mail Ops |
| Sentry | neue Issue-Spike | Slack |
