# Fleet Regression Report

Date: 2026-07-20

No feature is marked working until its command or manual evidence is recorded here.

| Gate | Command / evidence | Initial | After fixes | Notes |
|---|---|---|---|---|
| Backend type-check | `cd backend && npx tsc -p tsconfig.json --noEmit` | PASS | PASS | Final exit 0 |
| Backend tests | `cd backend && npm test` | PASS 214 | PASS 218 | 58 specs, 0 failed |
| Codec8 + tacho verifier | Simulator piped to verifier | BLOCKED then PASS | PASS | Seed refreshed; standalone gateway used; 5/5 checks |
| Tenant isolation | `cd backend && npx ts-node scripts/tenant-isolation-check.ts` | PASS | PASS | Two tenants plus scoped model samples |
| Frontend lint | `cd frontend && npm run lint` | FAIL: 9,722 errors | PASS | 0 errors, 21 warnings after generated-output fix |
| Frontend verify | `cd frontend && npm run verify` | PASS | PASS | i18n + type-check + isolated production build |
| E2E environment | `cd qa-agents/e2e && npm run check:env` | PASS | PASS | Five roles configured; values not logged |
| Critical E2E | Smoke and access-control Playwright specs | FAIL 2/20 | PASS 20/20 | PDF and selector regressions fixed |
| Document RBAC | Dedicated Playwright spec | BLOCKED by setup 429 | PARTIAL: 3 pass, 3 skip | Data-dependent privacy/direct-ID/tenant cases remain blocked |
| Client secret scan | Static bundle marker search | NOT RUN | PASS | 0 files for JWT/DB/Redis/seed-password markers |
| Exploratory | Five role personas plus new/malicious user | NOT RUN | PARTIAL | Office/driver and malformed-user-input paths sampled; full charter pending |

## Regression Policy

After each fix, run the narrowest new regression test first. Then rerun the complete affected stack gate. Backend changes require the repository-defined backend battery from the first command; frontend changes require `npm run verify`; cross-stack workflow changes require both plus focused Playwright coverage.

## Residual Risk

No critical finding was reproduced. The one verified High defect is fixed with unit and E2E regression coverage. Endpoint-by-endpoint API permutations, all five complete persona charters, responsive viewport sweeps, concurrency/two-tab workflows and three document authorization tests remain unverified; they must not be interpreted as passing.
