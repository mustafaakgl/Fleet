# Fleet Security and RBAC Report

Date: 2026-07-20

## Initial Architecture Review

| Control | Current design evidence | Required dynamic proof | Status |
|---|---|---|---|
| Authentication | JWT/refresh guards in backend auth stack | No token, malformed token, expiry and refresh tests | PARTIAL: unauth redirect pass; repeated login 429 observed |
| Route authorization | `@Roles`, `RequiresWrite`, `RolesGuard` | Wrong-role request per critical controller | PARTIAL: document route guard and driver approve 403 pass |
| Canonical permissions | `backend/src/common/permissions/permission-matrix.ts` | Decorator-to-matrix drift test | NOT RUN |
| Tenant isolation | Prisma tenant extension and scoped-model registry | Cross-tenant reads/writes plus isolation script | PASS for isolation script; document browser/API fixture blocked |
| UI role controls | Frontend navigation/permission helpers and route guards | Menu/page/API parity for five roles | PARTIAL: office/driver document route guards pass |
| Upload security | Module-specific upload validation | MIME, size, filename, traversal and download authorization | PARTIAL: malformed equipment PDF fixed/tested; broader matrix pending |
| Rate limiting | Application configuration review required | Safe local burst test on auth/upload endpoints | PASS observation: repeated E2E login received 429 |
| Session security | Browser token storage and refresh behavior | Logout, stale refresh, cookie/header inspection | NOT RUN |
| Secret exposure | Server/client env split and Next build | Bundle grep for known secret names/patterns | PASS: 0 static files matched four server/seed secret markers |
| Logging/redaction | Logger and exception filters require review | Trigger safe errors and inspect local logs/responses | NOT RUN |

## Threat Test Set

1. IDOR/BOLA: submit another tenant's driver, vehicle, assignment, document and company IDs under every allowed role.
2. Mass assignment: add `tenantId`, `role`, ownership, status and audit fields to create/update payloads.
3. Injection: harmless SQL metacharacters and structured payloads in search/filter/sort fields.
4. XSS: inert marker strings in text fields and exported data; verify encoding without executing payloads.
5. CSRF: inspect whether cookie-authenticated state changes require origin/CSRF protection; bearer-only calls are evaluated separately.
6. Files: reject path components, unsupported MIME/signature combinations, oversized files and unauthorized download IDs.
7. Rate limiting: low-volume local checks that cannot degrade shared systems.
8. Sensitive data: inspect API schemas, errors, logs and frontend bundle for tokens, hashes, secrets and private document paths.

## RBAC Evidence Matrix

| Role | Menu | Page guard | API read | API write | Financial | Document privacy | Tenant isolation | Status |
|---|---|---|---|---|---|---|---|---|
| Admin | NOT RUN | Auth setup PASS | NOT RUN | NOT RUN | NOT RUN | BLOCKED dataset | Isolation script PASS | PARTIAL |
| Boss | NOT RUN | Auth setup PASS | NOT RUN | NOT RUN | NOT RUN | BLOCKED dataset | Isolation script PASS | PARTIAL |
| Accounting | NOT RUN | Auth setup PASS | NOT RUN | NOT RUN | NOT RUN | BLOCKED dataset | Isolation script PASS | PARTIAL |
| Office | NOT RUN | Driver portal denial PASS | Operational smoke PASS | Equipment create/approve PASS | NOT RUN | Private document test BLOCKED | Isolation script PASS | PARTIAL |
| Driver | NOT RUN | Dashboard/document denial PASS | Own flows PASS | Office approve denied 403 | Denied by scope | Own final document PASS | Isolation script PASS | PARTIAL |

## Preliminary Risk Notes

- Client-side route guards do not constitute authorization; every result must be paired with a backend denial/allowance check.
- The canonical permission matrix currently documents only a subset of application modules, so decorator drift is a priority static test.
- Browser access and refresh tokens are stored client-side; XSS impact and logout/revocation behavior require dynamic verification before risk acceptance.

## Remaining Security Gaps

- Private salary/medical visibility needs deterministic private-document seed data and a stable privacy selector.
- Direct-ID document authorization needs known allowed/denied document IDs and API-level assertions.
- Browser/API cross-tenant document proof needs a tenant B document fixture and tenant A credentials.
- CSRF, path traversal, polyglot upload, session revocation and complete controller-role drift remain `NOT RUN` in this iteration.
