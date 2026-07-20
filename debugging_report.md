# Fleet Debugging Report

Date: 2026-07-20

## Environment Baseline

| Check | Result | Evidence / blocker |
|---|---|---|
| Repository status | PASS | Existing unrelated changes identified and excluded from QA edits |
| Backend dependencies | PASS | Type-check/tests/runtime completed |
| Frontend dependencies | PASS | Lint/verify/dev server completed |
| PostgreSQL / Redis | PARTIAL | PostgreSQL integration passed; Redis unset, documented inline queue mode |
| Backend type-check | PASS | Final `tsc --noEmit` exit 0 |
| Backend tests | PASS | 65 specs, 233 tests, 0 failed |
| Frontend lint/type/build | PASS | 0 lint errors (21 warnings); i18n/type/build pass |
| E2E environment | PASS | Base URL and five role credentials configured; values not recorded |

Tooling note: VS Code's TypeScript 7 preview reports `moduleResolution: Node` as deprecated in the E2E harness. The repository-pinned `npx tsc --noEmit` passes; migration to Node16/NodeNext resolution is a separate toolchain change.

## Defect Record Template

Each verified issue will include:

- Reproduction steps and exact local prerequisite.
- Expected and actual behavior.
- Affected module, tenant and role.
- Severity and priority.
- Root cause and affected files.
- Minimal fix with no business-rule invention.
- Regression test and command output summary.

## Investigation Log

### QA-BASELINE-001

- Observation: Existing E2E harness has role storage states and failure artifacts, but environment and live service availability are not yet proven in this run.
- Discriminating check: Run environment validator, then focused smoke/access-control suites against local services.
- Result: Critical smoke/access-control 20/20 PASS. Document RBAC 3 PASS / 3 SKIPPED due deterministic data/testability gaps.
- Status: PARTIAL.

### QA-003 Equipment PDF 500

- Reproduction: Office creates issuance with a header-only malformed PDF; driver signs it.
- Expected: Malformed upload rejected with 400 before an issuance is persisted.
- Actual: Create succeeded; sign returned 500 from `PDFDocument.computePages`.
- Role/module: Office and driver, equipment issuance.
- Severity/priority: High / P0.
- Root cause: MIME-only upload validation deferred structural parsing until final PDF merge.
- Fix: Parse PDF and require at least one page during create/manual upload; remove invalid disk file best-effort and return 400.
- Regression: Unit malformed upload test plus valid generated-PDF E2E lifecycle.
- Result: FIXED.

### Test Infrastructure Findings

- Codec8 normal verification requires both a standalone gateway and a current-day demo assignment. After `seed-tacho-demo.mjs` and `start:gateway`, all five checks passed.
- Re-running role auth setup immediately can hit the intended login throttle (429). RBAC suites can reuse fresh storage states with `--no-deps`.
- Deterministic P0 seed now provisions two tenants, five roles per tenant, master data and four document privacy classes; workflow rows are reset on each run.
- Second-round focused suites: auth 6/6, master-data 4/4, workflows 4/4, documents/reminders 4/4, audit/privacy 2/2 and persona/offline route guards 6/6.
- Critical tenant finding: Tenant A could create a transport request referencing Tenant B entities and receive foreign PII. Scoped relation checks now fail with 404.
