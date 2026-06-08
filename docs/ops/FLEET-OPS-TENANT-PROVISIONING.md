# Fleet-Ops — Tenant Provisioning

MyFleet supports **multiple customers** (tenants). After the first bootstrap via `/onboarding`, Fleet-Ops provisions additional tenants.

---

## Access control

| Method | Config |
|--------|--------|
| UI (JWT) | `FLEET_OPS_EMAILS=ops@myfleet.app,founder@myfleet.app` |
| API / scripts | `FLEET_OPS_API_KEY` + header `X-Fleet-Ops-Key` |

Fleet-Ops users see **Kunden (Fleet-Ops)** in the sidebar → `/admin/tenants`.

---

## UI workflow

1. Log in with a `FLEET_OPS_EMAILS` account
2. Open `/admin/tenants`
3. **Neuer Kunde** → fill company + admin details
4. Customer receives welcome email (if SMTP enabled)
5. Customer logs in → `/getting-started` checklist

---

## API

```bash
# List tenants
curl -H "Authorization: Bearer $TOKEN" https://api.myfleet.app/api/v1/fleet-ops/tenants

# Provision (JWT or API key)
curl -X POST https://api.myfleet.app/api/v1/fleet-ops/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "fleet_name": "Müller Transport GmbH",
    "admin_full_name": "Hans Müller",
    "admin_email": "hans@mueller-transport.de",
    "admin_password": "SecurePass123!",
    "contact_email": "kontakt@mueller-transport.de"
  }'

# Suspend tenant
curl -X PATCH https://api.myfleet.app/api/v1/fleet-ops/tenants/TENANT_ID/status \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"suspended"}'
```

---

## Same-week onboarding

See `docs/ops/SAME-WEEK-ONBOARDING-PLAYBOOK.md` — Day 1 Fleet-Ops step now uses `/admin/tenants` instead of re-running `/onboarding/setup`.
