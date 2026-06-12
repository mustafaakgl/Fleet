# PROMPT 02 — Führerscheinkontrolle: Productize as a Standalone, Legally Defensible Module

> Copy everything below this line into your coding agent as a single task brief.

---

## Role & Context

You are a senior full-stack engineer working on **Fleet**, a multi-tenant German fleet-operations SaaS (NestJS 11 + Prisma 6 + PostgreSQL, BullMQ/Redis, S3 storage with per-type encryption keys, Next.js 15 App Router frontend, de/en/tr i18n, roles `admin|boss|accounting|office|driver|customer`, tenant isolation via Prisma extension — every new model must be registered in `tenant-scoped-models.ts`).

**What already exists (build on it, do not rebuild):**
- `DriverLicense` (classes[], issuedAt, expiresAt, front/back photo paths, nextCheckDueAt, reminder/escalation timestamps, soft delete)
- `LicenseCheck` (checkType `initial|periodic`, status `pending|approved|rejected`, verifiedById, front/back/selfie photo paths, photoMetadata, rejectionReason)
- Daily cron `license_checks.daily` (request periodic checks, reminders, escalations, retention purge — `LICENSE_CHECK_RETENTION_MONTHS`, default 6 post-termination)
- Encrypted photo storage (`LICENSE_PHOTO_ENCRYPTION_KEY`), driver portal upload flow, `AuditLog`, `Notification`, MailService, Stripe subscription module (`TenantSubscription` with plan/seat limits).

**Business goal:** German employers are personally criminally liable (StVG §21) if an employee drives without a valid license; case law requires *documented, regular* checks. Competitors (LapID, Fleetize) charge ~€2/driver/month for ONLY this. We turn our existing workflow into (a) a hardened, audit-proof compliance product and (b) a **standalone sellable plan** ("Fleet License Check") that works for tenants who buy nothing else — the land-and-expand wedge. What customers actually pay for is not the check; it is the *defensible evidence* that checks happened. Every design decision below serves evidence quality.

## Part A — Compliance hardening (the legal substance)

### A1. Check policy engine (per tenant)
New model `LicenseCheckPolicy` (1:1 tenant): intervalMonths (default 6 → two checks/year, the case-law baseline), reminderSchedule (days before/after due: default [-14, -7, 0, +3, +7]), escalationAfterDays (default 7 → notify office), managementEscalationAfterDays (default 14 → notify boss/admin role with explicit liability wording), gracePeriodDays (default 14), hardBlockEnabled (default **true**), checkMethod (`photo_selfie` now; enum extensible for future NFC/eID), requireBothSides (default true). Settings UI under Compliance settings; every change audit-logged (policy changes are themselves legally relevant).

### A2. Evidence quality — make the check manipulation-resistant
At submission (driver portal/mobile flow):
- **Capture-only enforcement** where platform allows: prefer camera capture over gallery upload; record which path was used in `photoMetadata` (a gallery upload is not rejected but is flagged in the evidence record — reviewers see it).
- **Quality gate** before submission completes: blur detection (Laplacian variance via `sharp`), minimum resolution, document-edge presence heuristic; on failure → instant retake prompt with specific reason ("Foto unscharf — bitte erneut aufnehmen"). Target: <5% office-side rejections for quality.
- **Consistency evidence:** capture timestamp vs. server receipt drift, GPS (if consented) recorded; selfie + license-front captured in one guided session with a server-issued one-time nonce displayed on screen and required in frame metadata (session binding — prevents replaying old photos). Store all of it in a structured `evidenceJson` on `LicenseCheck`.
- **OCR assist (not gate):** extract license number, classes, expiry from the front photo (use `tesseract.js` server-side or a pluggable OCR interface); pre-fill and **diff against the stored `DriverLicense` record** — mismatches flag the check `needs_review` with the diff shown to the reviewer. OCR is assistive: the human verifier always confirms; never auto-approve.
- **Integrity seal:** at approval, compute SHA-256 over (photos + evidenceJson + reviewer + timestamps), store as `evidenceHash`, and chain it: include previous check's hash for the same driver (`previousEvidenceHash`) — a tamper-evident sequence per driver. Document the scheme in `docs/license-check-evidence.md`.

### A3. The certificate (what the customer shows the prosecutor)
On approval, render a **Prüfbescheinigung PDF** (German, formal): tenant legal name, driver name + employee number, license number + classes, check date/time, method, verifier name, policy interval, evidence hash, QR code linking to a verification endpoint (`GET /license-checks/verify/:hash` — public, returns only valid/invalid + date, no personal data). Store immutably (render-once). New: **fleet-level annual dossier** — one click generates a sealed PDF: policy, every driver's check history for the period, exceptions with justifications, current compliance rate. This is the artifact a Verkehrsleiter hands to an auditor; make it beautiful and boring.

### A4. Hard block with audited override
When a driver's check is overdue past grace, or license expired: `Driver` gains computed `drivingClearance` (`cleared|warning|blocked`) exposed everywhere drivers are listed/assigned. Assignment creation/edit for a `blocked` driver is **rejected by default**; override requires `boss|admin` role + mandatory reason → both stored in AuditLog and listed in the annual dossier ("Übersteuerungen"). Replace the existing soft `createAssignmentWithLicenseAck` flow with this. Dashboard queue card: "2 drivers blocked, 3 in warning — [Review]".

## Part B — Standalone product packaging (the business)

### B1. Plan & entitlements
Extend the subscription system with **feature entitlements** rather than hardcoded plan checks: new `TenantEntitlement` concept (either a JSON field on `TenantSubscription` or a small table): `license_check` standalone plan (per-driver pricing, new Stripe price `STRIPE_PRICE_LICENSE_CHECK` env, metered by active driver count — report usage to Stripe monthly via existing BullMQ), or included in `pro|enterprise`. Backend: a lightweight `@RequiresEntitlement('license_check')` guard. Frontend: navigation and routes render by entitlement (a license-check-only tenant sees: Dashboard-lite, Drivers (reduced columns), License Checks, Settings — nothing else; no stub doors).

### B2. Standalone onboarding
A license-check-only signup must reach first value in <15 minutes: guided flow — import drivers via existing CSV import (reduced template: name, email/phone, license number, expiry) → policy defaults confirmed on one screen → bulk-invite drivers (existing invitation system; SMS-ready interface, email now) → drivers complete initial check from their phone → live compliance ring fills up on the admin's screen during onboarding. Ship a dedicated `/getting-started` variant for this plan.

### B3. Reporting & comms for this persona
Monthly automatic management report (email PDF): compliance rate, completed/overdue checks, escalations, blocked-driver days. This report is the renewal argument; schedule it via existing cron infra, per-tenant toggle.

## Data model changes (Prisma migration)

- `LicenseCheckPolicy` (new, tenant-scoped, defaults seeded for existing tenants).
- `LicenseCheck`: add `evidenceJson` (JSON), `evidenceHash`, `previousEvidenceHash`, `certificatePdfPath`, `needs_review` to status enum, `qualityFlags` JSON, `submissionChannel` (`driver_portal|mobile_app`), `ocrExtract` JSON.
- `Driver`: no schema change for clearance — compute in service layer (single source: `DrivingClearanceService`), expose via API on driver list/detail/assignment-candidate responses.
- `TenantSubscription`: entitlements JSON + migration mapping existing plans (basic → none standalone, pro/enterprise → included).
- Register new models in `tenant-scoped-models.ts`; tenant-isolation tests for every new endpoint.

## Backend work (module `license-checks/` — extend existing)

- Policy CRUD (`GET/PUT /license-checks/policy`, admin/boss only).
- Submission endpoint: extend with quality gate, nonce session (`POST /license-checks/:id/session` issues nonce, 10-min TTL), evidence assembly, OCR job (async via BullMQ — submission never waits on OCR; result patches the check and may flip it to `needs_review`).
- Review endpoints: approve (→ hash, certificate render, next due date per policy, notification), reject (reason taxonomy: `unreadable|wrong_document|expired|suspected_manipulation|other` — taxonomy feeds the quality dashboard).
- `GET /license-checks/compliance` — fleet summary (rate, overdue, warning, blocked, next 30 days due) for dashboard + report.
- `GET /license-checks/dossier?year=` — annual dossier PDF (BullMQ job, notification with download link when ready).
- Public `GET /license-checks/verify/:hash` (no auth, rate-limited, returns validity + date only).
- Rework cron: drive everything from `LicenseCheckPolicy` instead of env-default intervals; keep retention purge.
- Stripe: standalone price, monthly usage reporting job, webhook handling for the new product.

## Frontend work

1. **`/license-checks` (rework):** compliance ring header (big %, green/amber/red split), filterable table (due, overdue, in review, blocked) with bulk reminder action, drill into check detail.
2. **Check review screen (the verifier's cockpit):** side-by-side front/back/selfie with zoom, OCR diff panel (stored vs. read, mismatches highlighted), evidence panel (capture channel, timestamps, quality flags, nonce validity), approve/reject with reason — keyboard-driven (A approve, R reject, arrows navigate queue). A reviewer should clear 20 checks in 5 minutes.
3. **Driver flow (driver portal):** guided 3-step capture (front → back → selfie with nonce on screen), instant quality feedback with retake, status tracking, certificate visible in driver's documents after approval. All three languages, native-quality German strings.
4. **Settings → Compliance policy** screen; **Dashboard** queue cards (blocked/warning); **driver list** clearance column (replaces the current FS badge); assignment forms surface clearance with the override dialog.
5. Standalone-plan navigation variant + onboarding flow (B2).

## Quality bar / acceptance criteria

- Tenant-isolation tests on all new endpoints; entitlement guard tests (license-check-only tenant gets 403 on, e.g., `/invoicing`).
- Unit tests: hash chaining (tamper detection — modify a stored photo byte, chain validation fails), policy date math (next due across month/year boundaries), nonce expiry/replay rejection, OCR diff flagging.
- E2E: invite driver → initial check submitted with quality retake → approved → certificate verifiable via public hash endpoint → 6 months later cron requests periodic check → ignored → reminder cascade → escalation → driver blocked → assignment rejected → override with reason → appears in annual dossier.
- Performance: review queue loads <500ms with 200 pending checks; photos lazy-loaded, decrypted server-side, never cached client-side.
- DSGVO: photos remain encrypted at rest, retention purge still honors `LICENSE_CHECK_RETENTION_MONTHS`, the public verify endpoint leaks zero personal data, certificate PDFs included in existing privacy export ZIP.
- Reviewable commits: (1) schema + policy engine, (2) clearance service + hard block, (3) evidence pipeline (nonce, quality, hash), (4) OCR assist, (5) certificate + dossier rendering, (6) entitlements + Stripe, (7) review cockpit UI, (8) driver flow UI, (9) standalone onboarding + nav, (10) reports + i18n sweep.

**Out of scope (do not build now):** NFC/eID reading of the license chip (design the `checkMethod` enum so it can be added), SMS provider integration (interface only), white-label, works-council export pack (next iteration), Fleetize/LapID data import (later migration tool).

**One more deliverable:** `docs/license-check-legal-pack.md` — a plain-language description of the full process (intervals, evidence, hash chain, retention, override audit) written so the founder can hand it to a Fachanwalt für Verkehrsrecht for a supporting legal opinion. The code is the product; this document is what makes it sellable.
