# Fleet Regression Report

Date: 2026-07-20

No feature is marked working until its command or manual evidence is recorded here.

| Gate | Command / evidence | Initial | After fixes | Notes |
|---|---|---|---|---|
| Backend type-check | `cd backend && npx tsc -p tsconfig.json --noEmit` | PASS | PASS | Final exit 0 |
| Backend tests | `cd backend && npm test` | PASS 214 | PASS 233 | 65 specs, 0 failed |
| Codec8 + tacho verifier | Simulator piped to verifier | BLOCKED then PASS | PASS | Seed refreshed; standalone gateway used; 5/5 checks |
| Tenant isolation | `cd backend && npx ts-node scripts/tenant-isolation-check.ts` | PASS | PASS | Two tenants plus scoped model samples |
| Frontend lint | `cd frontend && npm run lint` | FAIL: 9,722 errors | PASS | 0 errors, 21 warnings after generated-output fix |
| Frontend verify | `cd frontend && npm run verify` | PASS | PASS | i18n + type-check + isolated production build |
| E2E environment | `cd qa-agents/e2e && npm run check:env` | PASS | PASS | Five roles configured; values not logged |
| Critical E2E | Smoke and access-control Playwright specs | FAIL 2/20 | PASS 20/20 | PDF and selector regressions fixed |
| Document RBAC | Dedicated P0 API spec | BLOCKED by missing fixture | PASS 3/3 | Four document classes, own-data, direct-ID, tenant and malformed upload verified |
| P0 auth/session API | `npm run test:p0:auth` | NOT RUN | PASS 6/6 | Access/refresh expiry, rotation, reuse, logout, roles and 429 |
| P0 master-data API | `npm run test:p0:master-data` | FAIL | PASS 4/4 | Users, drivers, vehicles, companies, RBAC and tenant scope |
| P0 workflow API | `npm run test:p0:workflows` | FAIL | PASS 4/4 | Assignment, request, leave, transport and calendar effects |
| P0 document security | `npm run test:p0:documents` | BLOCKED | PASS 4/4 | Privacy, reminder dedupe, own-data, direct-ID, tenant, malformed and oversized upload |
| P0 audit/privacy API | `npm run test:p0:audit` | NOT RUN | PASS 2/2 | Role deny/allow, tenant scope, safe filter and secret reflection |
| P0 five personas UI | `npm run test:p0:personas` | NOT RUN | PASS 6/6 | Dashboard/driver portal route guards and offline shell |
| Client secret scan | Static bundle marker search | NOT RUN | PASS | 0 files for JWT/DB/Redis/seed-password markers |
| Exploratory | Five role personas plus new/malicious user | NOT RUN | PARTIAL | Office/driver and malformed-user-input paths sampled; full charter pending |

## Regression Policy

After each fix, run the narrowest new regression test first. Then rerun the complete affected stack gate. Backend changes require the repository-defined backend battery from the first command; frontend changes require `npm run verify`; cross-stack workflow changes require both plus focused Playwright coverage.

## Residual Risk

One Critical cross-tenant transport relation defect and additional High security/workflow defects were reproduced and fixed with focused regressions. Detailed menu-item assertions, responsive viewport sweeps and PDF active-content sanitization remain outside this P0 application round; they must not be interpreted as passing.
