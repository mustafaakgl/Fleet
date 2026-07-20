# Fleet Test Matrix

Date: 2026-07-20

Each module is tested for happy path, invalid/boundary input, unauthenticated access, wrong role, cross-tenant identifiers, missing and duplicate records, pagination/filter/sort, concurrent requests, failure recovery and response-data exposure where applicable.

| ID | Module / flow | Unit | Integration / data | API / RBAC / tenant | E2E / exploratory | Priority | Status |
|---|---|---|---|---|---|---|---|
| TM-001 | Authentication/session | Token/expiry helpers | Refresh rotation/revocation | Unauthenticated redirect and 429 observed; expiry/refresh pending | Login and unauthenticated redirect pass; logout/expiry pending | P0 | PARTIAL |
| TM-002 | Users and roles | Permission helpers | Role persistence | Admin-only CRUD, mass assignment | Admin/new-user persona, menu/page/API parity | P0 | NOT RUN |
| TM-003 | Drivers | DTO/boundaries/status | Tenant unique employee, relations | CRUD, foreign tenant ID, pagination/filter/sort | Admin/office CRUD, accounting read-only, long input | P0 | NOT RUN |
| TM-004 | Vehicles | DTO/year/status/expiry | Unique plate, assignment relations | CRUD, duplicate, foreign tenant ID | CRUD, TÜV/SP indicators, export | P0 | NOT RUN |
| TM-005 | Companies | Validation | Relations and constraints | Financial fields by role, tenant isolation | CRUD and accounting visibility | P0 | NOT RUN |
| TM-006 | Assignments/planning | Conflict/state logic | Transaction, driver/vehicle availability | CRUD, duplicate/concurrent assignment | Office route pass; drag/drop/concurrency pending | P0 | PARTIAL |
| TM-007 | Requests to calendar | Transition/date logic | Create/update transaction | Role/tenant/not-found/idempotency | Request create/approve/reject/calendar | P0 | NOT RUN |
| TM-008 | Leave to calendar | Date overlap/status | Approval/rejection consistency | Role, tenant, duplicate decision | Office request, boss decision, calendar update | P0 | NOT RUN |
| TM-009 | Transport to assignment + AT | Transition/calculation | Atomic relation creation | Role, tenant, duplicate/concurrency | Office transport lifecycle | P0 | NOT RUN |
| TM-010 | Documents/reminders | Expiry/reminder logic | Equipment final document creation pass | Malformed equipment PDF rejected; direct-ID/tenant document fixture blocked | Route guards and equipment lifecycle pass; privacy dataset blocked | P0 | PARTIAL |
| TM-011 | Global search | Query normalization | Tenant-limited search | Injection, role filtering, pagination | Search, empty/long/special text | P1 | NOT RUN |
| TM-012 | Exports | Formatting/escaping | Dataset consistency | Role/tenant and formula injection | Excel download/content | P1 | NOT RUN |
| TM-013 | Driver portal | Status/availability helpers | Work-session start/stop/reconcile pass | Driver route guard and self issuance pass | Morning check-in, work session and reconcile pass; offline pending | P0 | PARTIAL |
| TM-014 | Telematics/tachograph | 218-test suite includes parser/rule coverage | Normal Codec8 scenario 5/5 pass | Tenant isolation script pass; role exposure pending | UI flows pending | P1 | PARTIAL |
| TM-015 | Notifications/reminders | Scheduling/dedup | Job idempotency/retry | Tenant/recipient scope | Empty/loading/error/read state | P1 | NOT RUN |
| TM-016 | Audit/privacy | Redaction/serialization | Immutable audit persistence | Admin/boss only, no secret/PII leak | Audit filters/export | P0 | NOT RUN |
| TM-017 | i18n/responsive | Locale/status mapping | N/A | N/A | Login de/en/tr pass; responsive/overflow pending | P1 | PARTIAL |
| TM-018 | File security | Equipment PDF structure regression pass | Malformed PDF cleanup/rejection pass | Header-only PDF now 400; traversal/polyglot/download matrix pending | Equipment success/failure paths pass | P0 | PARTIAL |

## Role Expectations

| Area | Admin | Boss | Accounting | Office | Driver |
|---|---|---|---|---|---|
| Users/settings administration | Full | Deny unless explicitly delegated | Deny | Deny | Deny |
| Driver/vehicle/company read | Allow | Allow | Allow | Allow | Self/assignment scope only |
| Driver/vehicle/company write | Allow | Allow | Deny | Allow | Deny |
| Assignments write | Allow | Allow | Deny | Allow | Assigned actions only |
| Financial data | Allow | Allow | Allow | Mask/deny sensitive fields | Deny |
| Private document download | Policy-specific admin path | Verify | Verify | Verify | Own documents only |
| Audit logs | Allow | Allow | Deny | Deny | Deny |

The backend authorization result is authoritative. Hidden UI controls are tested only as defense in depth.
