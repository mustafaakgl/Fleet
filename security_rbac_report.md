# Fleet Security and RBAC Report

Date: 2026-07-20

## Initial Architecture Review

| Control | Current design evidence | Required dynamic proof | Status |
|---|---|---|---|
| Authentication | JWT/refresh guards in backend auth stack | No token, malformed token, expiry and refresh tests | PASS: auth/session API 6/6, including rotation/reuse/logout/expiry/429 |
| Route authorization | `@Roles`, `RequiresWrite`, `RolesGuard` | Wrong-role request per critical controller | PASS for P0 auth, master-data, workflow, document and audit controllers |
| Canonical permissions | `backend/src/common/permissions/permission-matrix.ts` | Decorator-to-matrix drift test | PASS: five core controllers 5/5 |
| Tenant isolation | Prisma tenant extension and scoped-model registry | Cross-tenant reads/writes plus isolation script | PASS: dynamic master-data/workflow/document/audit checks plus isolation script |
| UI role controls | Frontend navigation/permission helpers and route guards | Menu/page/API parity for five roles | PASS for five persona route guards; detailed menu-item sweep remains exploratory |
| Upload security | Module-specific upload validation | MIME, size, filename, traversal and download authorization | PASS for P0 malformed signature, traversal filename, oversized input and download matrix |
| Rate limiting | Application configuration review required | Safe local burst test on auth/upload endpoints | PASS observation: repeated E2E login received 429 |
| Session security | Browser token storage and refresh behavior | Logout, stale refresh, cookie/header inspection | PASS for logout/stale refresh/reuse chain; cookie attribute inspection pending |
| Secret exposure | Server/client env split and Next build | Bundle grep for known secret names/patterns | PASS: 0 static files matched four server/seed secret markers |
| Logging/redaction | Logger and exception filters require review | Trigger safe errors and inspect local logs/responses | PARTIAL: login errors do not reflect passwords/tokens/hashes; full log sink review pending |

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
| Admin | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Boss | PARTIAL | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Accounting | PARTIAL | PASS | PASS | Denied as expected | PASS | PASS | PASS | PASS |
| Office | PARTIAL | PASS | PASS | PASS | Masked/denied | Private/salary/medical hidden; public PASS | PASS | PASS |
| Driver | PARTIAL | PASS | Own-data PASS | Operational writes denied | Denied by scope | Own documents PASS | PASS | PASS |

## Preliminary Risk Notes

- Client-side route guards do not constitute authorization; every result must be paired with a backend denial/allowance check.
- The canonical permission matrix still documents only a subset of application modules; the five core controllers are now protected by an executable drift test.
- Browser access and refresh tokens are stored client-side; XSS impact and logout/revocation behavior require dynamic verification before risk acceptance.

## Remaining Security Gaps

- Detailed menu-item visibility, CSRF/origin behavior, cookie attributes, oversized/polyglot upload variants and controller drift outside the five core modules remain open.
- Office private/salary/medical metadata and direct-ID downloads are denied; admin/boss/accounting and owner-driver fixture paths are dynamically verified.
