# Feature Priority Matrix — 20 Items

**Legende:** ✅ fertig · 🟡 teilweise · ❌ fehlt · 🔧 in Arbeit (Jun 2026)

| # | Feature | Prio | Status | Was fehlt |
|---|---------|------|--------|-----------|
| 1 | Multi-tenant | P0 | ✅ | CI cross-tenant tests optional |
| 2 | Secured file access | P0 | ✅ | — |
| 3 | Billing + Stripe limits | P0 | ✅ | Stripe Live (Ops) |
| 4 | Self-serve signup | P0 | ✅ | `POST /auth/signup` + `ALLOW_PUBLIC_SIGNUP=true` |
| 5 | User invitations | P0 | ✅ | Resend-UI optional |
| 6 | Transactional email | P0 | 🟡 | SMTP prod (Ops) |
| 7 | Password reset + MFA | P1 | ✅ | TOTP via `/security`, login MFA challenge |
| 8 | Compliance reminder cron | P1 | ✅ | `RemindersScheduler` 06:00 Berlin |
| 9 | Assignment create flow | P1 | ✅ | — |
| 10 | Double-booking detection | P1 | ✅ | Saat aralığı overlap (`start_time`/`end_time`) |
| 11 | GDPR export + erasure | P1 | ✅ | Driver + user anonymize (`POST /privacy/delete/user/:id`) |
| 12 | Audit coverage + export | P1 | ✅ | Leave-request audit + `/audit` UI + CSV export |
| 13 | Customer portal | P1 | ✅ | Proof upload + messaging (portal + Tagesübersicht drawer) |
| 14 | Driver↔user link + invite | P1 | ✅ | Invite accept link + auto-invite on driver create |
| 15 | Pagination all lists | P2 | 🟡 | assignments/users/documents optional pagination |
| 16 | Cloud storage S3 | P2 | ✅ | Prod bucket (Ops) |
| 17 | SSO/SAML | P2 | ✅ | OIDC (`SSO_OIDC_ENABLED=true`); SAML via IdP OIDC bridge |
| 18 | Bulk CSV import | P2 | ✅ | drivers, vehicles, companies, users |
| 19 | Telematics ELD | P2 | 🟡 | Mobile GPS only; no Geotab |
| 20 | Job queue + cache | P2 | ✅ | BullMQ when `REDIS_URL` set; inline fallback |

## Sprint-Reihenfolge

1. **P0 Rest** — Self-serve signup, SMTP/Stripe prod (Ops)
2. **P1 Batch 1** — Forgot password, reminder cron, double-booking, driver link
3. **P1 Batch 2** — ✅ User erasure, portal proof upload (audit export war Batch 1)
4. **P1 Batch 3** — ✅ Audit UI + leave-request coverage, pagination (assignments/users/documents), portal messaging
5. **P2** — ✅ OIDC SSO, BullMQ job queue, CSV companies/users (Jun 2026)
6. **Ops / scale** — Redis prod, SAML-native IdP, list UI pagination, telematics hardware
