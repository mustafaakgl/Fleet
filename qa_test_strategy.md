# Fleet QA Test Strategy

Date: 2026-07-20
Scope: Fleet web and backend, excluding `billing/`, `customer-portal/`, `invoicing` and `qa-agents/` except `qa-agents/e2e/`.

## Objective

Find and safely reproduce functional defects, authorization gaps, cross-tenant access, data-integrity failures and incomplete user flows. Fix only verified defects whose intended behavior is unambiguous, add regression coverage, and rerun the relevant verification gates.

## System Map

| Layer | Technology | Primary verification |
|---|---|---|
| Backend | NestJS 11, Prisma 6, PostgreSQL 16, BullMQ/Redis | TypeScript, Node test runner, API probes, tenant isolation script |
| Frontend | Next.js 15 App Router, React, Tailwind 4, shadcn/Radix | ESLint, TypeScript, i18n check, production build, Playwright |
| Authentication | JWT access/refresh, optional MFA/OIDC | Unauthenticated, expired session and refresh-path API/E2E tests |
| Authorization | Nest guards/decorators and canonical permission matrix | Controller metadata checks plus live API denial tests |
| Tenancy | Prisma tenant-scoping extension | Cross-tenant API tests and `tenant-isolation-check.ts` |
| Telemetry | Teltonika gateway, BullMQ, Redis, PostgreSQL | Codec8 simulator and tacho/telematics verifier |

Roles in scope: `admin`, `boss`, `accounting`, `office`, `driver`. The `customer` role and customer portal are excluded by repository rules.

## Critical Workflows

1. Request creation to calendar event.
2. Transport creation to assignment and AT lifecycle.
3. Document creation to reminder generation.
4. Leave approval/rejection to calendar update.
5. Assignment changes to driver and vehicle availability.
6. Login, refresh, logout and session expiry.
7. Driver, vehicle, company and document lifecycle operations.
8. Assignment planning and drag/drop conflict handling.
9. TÜV/SP expiration display and reminders.
10. Export, global search, localization and responsive/error states.

## Execution Phases

| Phase | Work | Exit condition |
|---|---|---|
| 0 | Environment and static baseline | Commands, versions, dependencies and blockers recorded |
| 1 | Unit and static security tests | Pure logic, validation, state transitions and permission helpers executed |
| 2 | Integration and API tests | Database workflows, constraints, tenant boundaries and endpoint contracts exercised |
| 3 | E2E and exploratory sessions | Critical role-based workflows exercised with screenshots/traces on failure |
| 4 | Debugging and fixes | Every changed defect has root cause and regression test |
| 5 | Full regression | Required backend battery, frontend verify and critical E2E rerun |

## Evidence Rules

- Statuses are `PASS`, `FAIL`, `BLOCKED`, or `NOT RUN`; no inferred passes.
- A bug enters `bug_inventory.md` only after reproducible evidence exists.
- Playwright failures retain screenshots/video; retries retain traces.
- API evidence records role, tenant, route, request shape, status and redacted response.
- Secrets, tokens and personal data are never written to reports.
- Local, seeded data only. No production target or destructive security testing.

## Required Commands

Backend battery, restarted from the first command after each backend fix:

```bash
cd backend
npx tsc -p tsconfig.json --noEmit
npm test
node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs
npx ts-node scripts/tenant-isolation-check.ts
```

Frontend gates:

```bash
cd frontend
npm run lint
npm run verify
```

E2E gates:

```bash
cd qa-agents/e2e
npm run check:env
npx playwright test tests/smoke.spec.ts tests/access-control.spec.ts
```

## Stop Conditions

- Stop and report when a business-rule ambiguity would change persisted behavior.
- Stop after three failed repair attempts on the same defect.
- Do not proceed past a red required gate as if it passed.
- Record unavailable infrastructure or credentials as `BLOCKED`, including the exact non-secret prerequisite.

## Execution Summary

This run completed the backend battery, frontend static/production gates, critical smoke/access-control E2E, document route RBAC, a client-bundle secret scan and focused exploratory checks around empty states, repeated authentication, malformed PDF upload and driver signing. Broad endpoint-by-endpoint API coverage and all persona workflows remain scheduled in `test_matrix.md`; they are not inferred as passing.
