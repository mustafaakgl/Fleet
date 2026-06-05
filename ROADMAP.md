# Fleet — Commercial Launch Roadmap

**Goal:** Sell a €300/month subscription to ~100 German SMB fleets (15–50 vehicles each) via a sales-led, demo-driven motion (4 German-speaking reps cold-calling + on-site live demos).

**Strategic positioning:** Not a telematics competitor (Samsara/Geotab). Fleet is a **dispatch + workforce + compliance back-office for German subcontractor fleets** (Einsatzplan, Personaleinsatz, DSGVO/TÜV compliance).

**Sequencing principle:** Because reps demo the live system to skeptical German buyers, *demo integrity* and *legal/trust* come before billing and self-serve. Self-serve signup is NOT needed (sales onboards manually).

---

## Phase 0 — Demo Integrity ("Sahaya çıkılabilir") — Weeks 1–2

> Goal: A German fleet owner can click around the live product during a demo without ever seeing anything fake, broken, or non-German.

- [x] **0.1** Hide/feature-flag demoware modules from nav: `Flottenmonitor` (mock telematics), `DSGVO` stub, `Settings` stub — `frontend/lib/navigation.ts`, `frontend/components/layout/Sidebar.tsx`
- [x] **0.2** Remove/replace hardcoded KPIs in Einsatzplan admin "Dashboard" & "Statusübersicht" tabs (42/31/58/124) — wire to real data or remove tabs — `frontend/components/einsatzplan/EinsatzplanPage.tsx`
- [x] **0.3** Fix `Benutzerverwaltung` (in-memory user CRUD): wire to `usersApi` or remove from Einsatzplan
- [x] **0.4** Remove the dev role-switcher from the production `Header.tsx`
- [x] **0.5** Fix broken assignment create flow: dead "Neue Planung" button + `/assignments/new` raw-UUID form → coherent create UX
- [x] **0.6** German i18n completeness pass on all demo-path screens (no mixed EN/DE/TR)

## Phase 1 — Legal & Trust to take money (DSGVO) — Weeks 3–4

> **Goal:** A German fleet owner can ask *"Sind meine Daten sicher? Gibt es einen AVV? Was passiert bei Löschung?"* — and the rep can **show it live**, not hand-wave.

> **Exit criterion:** First paying customer can sign AVV + you pass a 15-minute DSGVO checklist without embarrassment.

**Current gaps (code audit, Jun 2025):**

| Risk | Location | Severity |
|------|----------|----------|
| Public PII file serving | `backend/src/main.ts` → `app.useStaticAssets(uploadsRoot, { prefix: '/uploads' })` | **Critical** — anyone with URL reads licenses/passports |
| Weak JWT default | `backend/src/auth/auth.module.ts` → `JWT_SECRET ?? 'development_jwt_secret'` | **Critical** in prod |
| No password reset | `auth.controller.ts` has only `login` + `me` | **High** — ops can't onboard securely |
| No rate limiting | `app.module.ts` — no `@nestjs/throttler` | **High** — brute-force on `/auth/login` |
| Weak password policy | `create-user.dto.ts` → `@MinLength(6)` only | **Medium** |
| No data export/deletion API | — | **High** — Art. 15/17 not demonstrable |
| DSGVO page removed (Phase 0) | was stub; needs real page | **High** for sales |
| Audit gaps | `users`, `drivers`, `vehicles`, `companies`, `morning-checkins` services have **zero** audit calls | **Medium** — accountability gap |

**Sequencing:** 1.1 (files) and 1.2 (auth) are **blockers** — do first. 1.3 (DSGVO UI/API) and 1.4 (audit) can overlap in week 2.

---

### 1.1 — Secure file access (PII documents & vehicle photos)

**Problem:** `fileUrl` stored as `/uploads/documents/{filename}` and served without auth. Frontend links directly (`documents/page.tsx`, `resolveAssetUrl` in `utils.ts`).

#### 1.1.1 Remove public static serving
- [x] Delete `app.useStaticAssets(uploadsRoot, …)` from `backend/src/main.ts`
- [x] Keep directory creation (`mkdirSync`) — files still on disk
- [x] Update `README.md` §8 (no longer "static serving from `/uploads`")
- **Acceptance:** `curl http://localhost:3000/uploads/documents/any-file.pdf` → **404** (not file content)

#### 1.1.2 Auth-gated download endpoints
- [x] New `FilesController` or extend `DocumentsController`:
  - `GET /api/v1/files/documents/:storedFileName` — stream file with `Content-Disposition: inline`
  - `GET /api/v1/files/vehicles/:storedFileName` — same for vehicle photos
- [ ] Guards: `JwtAuthGuard` + role check (operational roles; drivers only own docs via `driver-mobile` path)
- [ ] **Authorization logic:** resolve `Document` by stored filename → verify `ownerType`/`ownerId` access (driver doc: admin/dispatch/office; driver self via mobile)
- [ ] Vehicle photos: verify user can read that `Vehicle`
- [ ] Set `Content-Type` from extension; `Cache-Control: private, no-store`
- [ ] Log download in audit: `document.download` / `vehicle_photo.download`
- **Files:** `backend/src/files/` (new module) or `documents.controller.ts`, `vehicles.controller.ts`, `storage/local-storage.service.ts`

#### 1.1.3 Change URL storage model
- [x] Stop storing public paths in DB. Options (pick **A** for minimal diff):
  - **A (recommended):** Keep `fileUrl` as internal key `/uploads/documents/{filename}` but never expose statically — frontend always calls API download URL
  - **B:** Migrate column to `storedFileName` only; derive download URL in API responses as `/api/v1/files/documents/{name}`
- [ ] `LocalStorageService.buildPublicUrl()` → rename to `buildStoredPath()`; add `buildDownloadUrl(documentId)` returning authenticated API path
- [ ] API list/get document responses include `download_url: '/api/v1/documents/:id/download'` (preferred — ID-based, no filename guessing)

#### 1.1.4 Frontend migration
- [x] `frontend/lib/api.ts` — add `documentsApi.download(id)` → blob URL or `window.open` with Authorization header
- [ ] Replace direct `<a href={resolveDocumentUrl(...)}>` in:
  - `frontend/app/(dashboard)/documents/page.tsx`
  - Driver/vehicle/company detail pages (document sections)
  - `VehiclePlateDisplay.tsx` (vehicle photos — may need blob URL for `<img>`)
- [ ] `frontend/next.config.ts` — remove `/uploads/**` image remote patterns (no longer needed)
- [ ] `frontend/lib/utils.ts` — deprecate `resolveAssetUrl` for uploads; use authenticated fetch helper
- **Acceptance:** Logged-out user cannot view any document; logged-in dispatch user can open license PDF in demo

#### 1.1.5 Driver mobile parity
- [x] `driver-mobile` document upload/download uses same gated endpoints (driver sees only own documents)
- [ ] Verify Expo app passes JWT on file fetch (not direct `/uploads` URL)

**Effort:** ~3–4 dev-days | **Owner:** backend-first, then frontend

---

### 1.2 — Auth hardening

**Problem:** Production can boot with `JWT_SECRET=secret`; login has no throttling; admins set 6-char passwords; no self-service reset.

#### 1.2.1 Enforce secrets at boot
- [x] `backend/src/config/env.validation.ts` (new) — validate on bootstrap:
  - `JWT_SECRET` required, min 32 chars, not in blocklist (`secret`, `development_jwt_secret`)
  - `NODE_ENV=production` → fail fast if defaults detected
- [x] Wire in `main.ts` before `NestFactory.create`
- [x] Update `backend/.env.example` with comment: *generate with `openssl rand -base64 32`*
- **Acceptance:** App refuses to start in production without strong `JWT_SECRET`

#### 1.2.2 Rate limiting
- [x] Install `@nestjs/throttler`
- [x] Global: 100 req/min per IP (tune for API)
- [x] `@Throttle({ default: { limit: 5, ttl: 60000 } })` on `POST /auth/login`
- [x] Return `429 Too Many Requests` with `Retry-After`
- [x] Audit log: `auth.login_rate_limited` (no email in metadata — privacy)
- **Files:** `app.module.ts`, `auth.controller.ts`

#### 1.2.3 Password policy
- [x] Shared validator `backend/src/common/validators/password-policy.ts`:
  - Min 10 characters
  - At least 1 uppercase, 1 lowercase, 1 digit
  - Block common passwords list (top 100)
- [x] Apply to `CreateUserDto`, `UpdateUserDto` (when password set), future reset DTO
- [x] Frontend: mirror validation in Benutzerverwaltung + reset form (zod schema)
- [x] i18n keys: `auth.passwordPolicy.*` (DE primary)

#### 1.2.4 Password reset flow (admin-assisted, sales-era)
> No public SMTP yet (Phase 2) — use **admin-initiated reset link** first.

- [x] Prisma model `PasswordResetToken`: `id`, `userId`, `tokenHash`, `expiresAt`, `usedAt`, `createdById`
- [x] `POST /auth/password-reset/request` — admin only → creates token, returns one-time link (for rep to paste in email manually)
- [x] `POST /auth/password-reset/confirm` — public with token + new password → validates, hashes, invalidates token
- [x] `GET /auth/password-reset/validate?token=` — frontend reset page checks token
- [x] Frontend: `/reset-password?token=` page (DE i18n)
- [x] Audit: `auth.password_reset_requested`, `auth.password_reset_completed`
- **Phase 2 upgrade:** same endpoints, but `request` sends email via SMTP automatically

#### 1.2.5 Session hygiene (lightweight)
- [x] Reduce JWT TTL: `expiresIn: '8h'` (was `1d`) — configurable via `JWT_EXPIRES_IN`
- [ ] Document in ops runbook: users re-login daily (acceptable for desk workers) — deferred

**Effort:** ~3 dev-days

---

### 1.3 — DSGVO features (demonstrable compliance)

**Problem:** FUNDING_DOCUMENTATION promises Art. 15/17/28 features; DSGVO nav page was removed as stub — needs **real** implementation.

#### 1.3.1 Data export ("Auskunft" / Art. 15)
- [x] `GET /api/v1/privacy/export/driver/:id` — admin only
- [x] ZIP containing:
  - `driver.json` — profile, license/passport fields, status, consent timestamps
  - `assignments.json`, `requests.json`, `morning_checkins.json`
  - `documents/` — copy of linked files (from disk)
  - `location_history.json` — if consent was given (else omit with note)
  - `audit_log_excerpt.json` — actions involving this driver
  - `README.txt` — DE explanation of contents + export date + legal basis
- [x] `GET /api/v1/privacy/export/user/:id` — for office staff data subjects
- [x] Audit: `privacy.data_export`
- [x] Frontend: button on driver detail page (admin) — "Datenexport (DSGVO)"
- **Acceptance:** Demo export for seed driver → downloadable ZIP, opens cleanly

#### 1.3.2 Data deletion / anonymization ("Löschung" / Art. 17)
- [x] `POST /api/v1/privacy/delete/driver/:id` — admin only, requires confirmation body `{ confirm: "DELETE", reason: "..." }`
- [x] Strategy (German fleet context — **anonymize, don't hard-delete assignments**):
  - Driver PII fields → `ANONYMIZED`, status → `terminated`
  - Delete document files from disk + DB rows
  - Null out `userId` link; deactivate linked `User`
  - Keep assignment rows with `driverId` pointing to anonymized record (legal retention for tax/labor)
  - Purge `DriverLocationHistory` for driver; delete `DriverLocationLatest`
- [x] Return summary of what was removed vs retained (with legal basis note)
- [x] Audit: `privacy.driver_anonymized`
- [x] Frontend: danger-zone section on driver detail (admin, double confirm dialog)

#### 1.3.3 DSGVO information page (in-app)
- [x] Restore route `frontend/app/(dashboard)/privacy/page.tsx` (not `/dsgvo` — use neutral path)
- [x] Nav entry: admin-only under compliance group, label `nav.privacy` → "Datenschutz"
- [x] Page sections (DE primary, EN/TR via i18n):
  1. **Verantwortlicher** — placeholder `[FIRMENNAME]` config (env or settings later)
  2. **Welche Daten wir verarbeiten** — drivers, vehicles, documents, location (with consent)
  3. **Rechtsgrundlagen** — Art. 6(1)(b) contract, (f) legitimate interest, (a) consent for GPS
  4. **Speicherdauer** — link to retention table (static for now)
  5. **Betroffenenrechte** — Auskunft, Berichtigung, Löschung, Widerspruch → show export/delete actions for admins
  6. **Auftragsverarbeiter** — sub-processor list (hosting, DeepL, Expo)
  7. **Kontakt** — `privacy@…` placeholder
- [x] Link from login footer ("Datenschutz") — public `/datenschutz`

#### 1.3.4 AVV (Auftragsverarbeitungsvertrag) template
- [x] `docs/legal/AVV-Vorlage-DE.md` — German DPA template (standard clauses: subject matter, duration, TOMs, sub-processors, breach notification, deletion after contract end)
- [x] `docs/legal/AVV-Anlage-TOMs.md` — Technical & organizational measures (reference Phase 1 implementations)
- [x] `docs/legal/Unterauftragsverarbeiter.md` — sub-processor list with purposes
- [x] Frontend privacy page: "AVV herunterladen" → static markdown download
- [ ] **Sales asset:** 1-page "TOMs summary" PDF for reps to attach to contracts — deferred (markdown available)
- **Note:** Legal review by German counsel recommended before first signature — template is engineering starting point, not legal advice

#### 1.3.5 Retention policy (documented + one cron)
- [x] Document retention periods in `docs/legal/Datenaufbewahrung.md`:
  - Location history: 90 days (configurable)
  - Audit logs: 2 years
  - Documents: until expiry + 1 year
  - Anonymized drivers: assignments retained 10 years (tax)
- [x] `backend/src/privacy/retention.job.ts` — nightly cron purges `DriverLocationHistory` older than threshold
- [x] Audit: `privacy.retention_purge`

**Effort:** ~4–5 dev-days (+ legal review time for AVV, not blocking code)

---

### 1.4 — Audit log coverage gaps

**Problem:** Sensitive CRUD on master data is invisible. `users.service.ts`, `drivers.service.ts`, `vehicles.service.ts`, `companies.service.ts`, `morning-checkins.service.ts` have no `AuditService` calls.

#### 1.4.1 Shared audit helper
- [x] Extract `safeAuditLog` to `backend/src/audit/audit-helper.ts` (avoid 15 copy-paste private methods)
- [x] Standard action naming: `{entity}.{created|updated|deactivated|deleted}`

#### 1.4.2 Wire audit events

| Service | Actions to log |
|---------|------------------|
| `users.service` | `user.created`, `user.updated`, `user.deactivated`, `user.password_changed` |
| `drivers.service` | `driver.created`, `driver.updated`, `driver.deactivated`, `driver.risk_changed` |
| `vehicles.service` | `vehicle.created`, `vehicle.updated`, `vehicle.deactivated`, `vehicle.photo_uploaded` |
| `companies.service` | `company.created`, `company.updated`, `company.deactivated` |
| `morning-checkins.service` | `morning_checkin.created`, `morning_checkin.updated`, `morning_checkin.status_changed` |

- [x] Pass `actorUserId` from controllers via `@CurrentUser('id')`
- [x] Metadata: changed field names only (no PII values in metadata)

#### 1.4.3 Admin audit viewer (minimal)
- [x] Existing `audit.controller.ts` — verify admin can list/filter
- [x] Frontend: simple read-only table at `/privacy/audit` (admin) — date, actor, action, entity, summary
- [x] i18n: `audit.*` keys (DE/EN/TR)

**Effort:** ~2 dev-days

---

### Phase 1 — Week-by-week plan

| Day | Focus | Deliverable |
|-----|-------|-------------|
| **W3 Mon–Tue** | 1.1.1–1.1.3 | Public `/uploads` dead; API download works in Postman |
| **W3 Wed–Thu** | 1.1.4–1.1.5 + 1.2.1–1.2.2 | Frontend doc viewing works; JWT enforced; login throttled |
| **W3 Fri** | 1.2.3–1.2.4 | Password policy + admin reset link E2E |
| **W4 Mon–Tue** | 1.3.1–1.3.2 | Driver export ZIP + anonymization demo |
| **W4 Wed** | 1.3.3–1.3.4 | Datenschutz page live; AVV template in repo |
| **W4 Thu** | 1.4 + 1.3.5 | Audit coverage; retention cron |
| **W4 Fri** | QA + sales rehearsal | Run DSGVO demo script (below) end-to-end |

---

### Phase 1 — DSGVO demo script (for sales team)

Train reps to run this **live** in 5 minutes during the second demo visit:

1. **"Ihre Führerscheine sind nicht öffentlich."** — Show document in app → copy URL → open incognito → access denied.
2. **"Wir protokollieren Zugriffe."** — Open Datenschutz → Audit log → show `document.download` entry.
3. **"Auskunft nach Art. 15."** — Driver detail → Datenexport → download ZIP, open `driver.json`.
4. **"Löschung nach Art. 17."** — Explain anonymization (assignments stay for Buchführung) — show policy text on page.
5. **"AVV ist vorbereitet."** — Download AVV template + TOMs Anlage for their lawyer.
6. **"Standort nur mit Einwilligung."** — Driver mobile consent screen + `locationTrackingConsentAt` in export.

---

### Phase 1 — Definition of Done

- [x] No unauthenticated file access anywhere (web + mobile)
- [x] Production boot fails without strong `JWT_SECRET`
- [x] Login rate-limited; password policy ≥10 chars enforced
- [x] Admin can reset user password via one-time link
- [x] Admin can export + anonymize driver data with audit trail
- [x] Datenschutz page in nav (admin) with DE content
- [x] AVV + TOMs + sub-processor docs in `docs/legal/`
- [x] Master-data CRUD + morning check-ins appear in audit log
- [x] Location history retention cron running
- [ ] `npm run dev:full` + manual QA pass on demo script above

---

### Phase 1 — Deliberately out of scope (→ Phase 2+)

- Automated email for password reset (needs SMTP — Phase 2.4)
- Customer self-service DSGVO portal (sales-led; admin performs export/delete)
- Multi-tenant isolation (Phase 4 — but document "single-tenant per deployment" in AVV for now)
- Virus scanning on uploads (SEC-8 — post-revenue hardening)
- Pen-test / formal DPIA document (legal counsel, not engineering)
- Cookie consent banner (no tracking cookies today; revisit if analytics added)

## Phase 2 — Onboard a closed customer — Weeks 5–6

> Goal: After a "yes" in the demo, get the customer live the same week (manual, not self-serve).

- [x] **2.1** Admin customer/tenant creation flow (replace DB-seed onboarding)
- [x] **2.2** User invitation flow (email + token)
- [x] **2.3** CSV import for drivers & vehicles
- [x] **2.4** Transactional email (SMTP) — and make `CompanyEmail` daily plans actually send (today: draft-only)

## Phase 3 — Billing — Weeks 7–8

> Goal: Collect €300/month from German SMBs.

- [x] **3.1** Stripe Billing + SEPA Lastschrift, plans (Basic/Pro/Enterprise), seat/vehicle limits, German invoicing; manual-invoice fallback for early customers

## Phase 4 — Multi-tenancy (PARALLEL, start with Phase 2) — Weeks 5–12

> Goal: One deployment serves 100+ customers. Per-customer single-tenant deployments collapse operationally after ~20–30 customers.

- [x] **4.1** Schema: add `tenantId` to all models; convert global unique constraints (email, plateNumber, employeeNumber, internalCode, company name) to per-tenant
- [x] **4.2** Prisma client extension / middleware for automatic tenant scoping on every query
- [x] **4.3** Tenant context resolution from JWT; tenant-aware guards
- [x] **4.4** Data migration + isolation tests

## Phase 5 — Production Hardening & Go-Live — Weeks 9–10

> Goal: Deploy one shared production stack with observability, health probes, and ops-ready logging — without changing product scope.

- [x] **5.1** Health endpoints: `GET /api/v1/health` (liveness), `GET /api/v1/health/ready` (DB readiness)
- [x] **5.2** Structured JSON request logging (method, path, status, duration, tenant/user; skips `/health`)
- [x] **5.3** Login rate-limit audit (`auth.login_rate_limited`) + `Retry-After` on 429
- [x] **5.4** Graceful shutdown hooks (`enableShutdownHooks`)
- [x] **5.5** Public route markers (`@Public`) on auth + health; ROADMAP Phase 0 completion sync

### Phase 5 — Deliberately out of scope (post-revenue)

- Centralised log aggregation (Datadog/ELK) — use JSON stdout + host agent later
- Virus scanning on uploads (SEC-8)
- Uptime alerting (PagerDuty/Opsgenie)

## Phase 6 — Infrastructure & Security Hardening — Weeks 11–12

> Goal: Production ops checklist (RBAC, audit, storage, observability, backups, GDPR retention, CI) is demonstrable to enterprise buyers.

- [x] **6.1** RBAC: `PERMISSION_MATRIX`, global `WriteRoleGuard`, `@RequiresWrite()` on all operational write endpoints
- [x] **6.2** Audit: `safeAuditLog` on reminders, calendar, service-records, vehicle photos; tenant-scoped audit rows
- [x] **6.3** S3/MinIO: `ObjectStorageService` (`STORAGE_DRIVER=local|s3`), document/photo sync + stream download
- [x] **6.4** Rate limiting: per-endpoint throttles on uploads, privacy export, CSV import, search
- [x] **6.5** Prometheus: `GET /api/v1/metrics`, `fleet_http_requests_total` + duration histogram via request interceptor
- [x] **6.6** Sentry: backend bootstrap + `@sentry/nextjs` frontend (optional via `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`)
- [x] **6.7** Daily backup script: `scripts/backup-daily.sh` (pg_dump + uploads tarball)
- [x] **6.8** GDPR retention cron: location history, audit logs, notifications, messages, expired documents
- [x] **6.9** Load testing: `scripts/load/k6-smoke.js` (health/ready smoke)
- [x] **6.10** Pentest prep: `docs/security/PENTEST-CHECKLIST.md` + `npm audit` in CI
- [x] **6.11** Multi-tenant: `DriverLocationLatest.tenantId` migration + extended isolation check in CI
- [x] **6.12** API versioning: `X-API-Version` + `X-API-Deprecation-Policy` response headers
- [x] **6.13** CI/CD: `.github/workflows/ci.yml` (build, migrate, tenant isolation, audit)
- [x] **6.14** DR documentation: `docs/ops/DISASTER-RECOVERY.md`

---

## What we deliberately are NOT building yet
- Self-serve signup / public pricing funnel (sales onboards manually)
- Real telematics/ELD hardware integration (not our positioning)
- AI Dispatcher / Predictive Maintenance (premium hooks come AFTER paying customers)

## AI premium hooks (post-revenue)
1. AI OCR document processing (auto-extract expiry dates) — highest ROI
2. Compliance intelligence (auto-prioritize/escalate reminders)
3. AI dispatcher assist (suggest driver/vehicle by availability)
