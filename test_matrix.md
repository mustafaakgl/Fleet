# Fleet Test Matrix

Date: 2026-07-20

Each module is tested for happy path, invalid/boundary input, unauthenticated access, wrong role, cross-tenant identifiers, missing and duplicate records, pagination/filter/sort, concurrent requests, failure recovery and response-data exposure where applicable.

| ID | Module / flow | Unit | Integration / data | API / RBAC / tenant | E2E / exploratory | Priority | Status |
|---|---|---|---|---|---|---|---|
| TM-001 | Authentication/session | Token/expiry helpers | Rotation, reuse-chain revocation and logout verified | Missing/malformed/expired access, stale/expired refresh and 429 verified | Five-role login/session API suite 6/6 | P0 | PASS |
| TM-002 | Users and roles | Permission matrix drift 5/5 | Role persistence | Admin-only CRUD, escalation/mass assignment and tenant scope verified | Five persona route guards 5/5 | P0 | PASS |
| TM-003 | Drivers | Future/expired date boundary 2/2 | Tenant relations | CRUD, validation, duplicate, foreign tenant ID, pagination/filter/sort verified | Admin/office write and accounting read-only verified | P0 | PASS |
| TM-004 | Vehicles | DTO/status validation | Unique conflict mapped to 409 | CRUD, duplicate, foreign tenant ID and sorting verified | Operational persona/API coverage complete; export remains P1 | P0 | PASS |
| TM-005 | Companies | Validation | Relations and constraints | Financial mask, write roles, duplicate and tenant isolation verified | Accounting visibility and office masking verified | P0 | PASS |
| TM-006 | Assignments/planning | Conflict/state logic | Serializable transaction, driver/vehicle availability and AT event verified | RBAC, tenant ID, transitions and true two-request race verified | Office planning route and current quick-assign contract verified | P0 | PASS |
| TM-007 | Requests to calendar | Transition/date logic | Approval creates exact calendar days | Role/tenant/not-found/idempotency and approver spoofing regression verified | Office create/approve/calendar API flow pass | P0 | PASS |
| TM-008 | Leave to calendar | Date/status validation | Approval/rejection consistency | Accounting deny, boss decision and duplicate decision verified | Office request, boss approval and KT event pass | P0 | PASS |
| TM-009 | Transport to assignment + AT | Transition/calculation | Atomic assignment and AT creation verified | Role, cross-tenant relations and duplicate approval verified | Office lifecycle API pass | P0 | PASS |
| TM-010 | Documents/reminders | Expiry/reminder logic | Equipment final document and generate-twice reminder dedupe pass | Four document classes, office-sensitive deny, direct-ID, own-data and tenant isolation verified | Admin/boss/accounting and owner-driver downloads pass; office sensitive types 404 | P0 | PASS |
| TM-011 | Global search | Query normalization | Tenant-limited search | Injection, role filtering, pagination | Search, empty/long/special text | P1 | NOT RUN |
| TM-012 | Exports | Formatting/escaping | Dataset consistency | Role/tenant and formula injection | Excel download/content | P1 | NOT RUN |
| TM-013 | Driver portal | Offline queue ordering/retry helpers pass | Work-session start/stop/reconcile pass | Driver route guard and self issuance pass | Persona route and service-worker offline shell pass | P0 | PASS |
| TM-014 | Telematics/tachograph | 218-test suite includes parser/rule coverage | Normal Codec8 scenario 5/5 pass | Tenant isolation script pass; role exposure pending | UI flows pending | P1 | PARTIAL |
| TM-015 | Notifications/reminders | Scheduling/dedup | Job idempotency/retry | Tenant/recipient scope | Empty/loading/error/read state | P1 | NOT RUN |
| TM-016 | Audit/privacy | Error secret-reflection check | Immutable audit persistence | Admin/boss allow, other-role deny and tenant actor scope verified | Filter/export API checks pass | P0 | PASS |
| TM-017 | i18n/responsive | Locale/status mapping | N/A | N/A | Login de/en/tr pass; responsive/overflow pending | P1 | PARTIAL |
| TM-018 | File security | Equipment PDF structure regression pass | Malformed PDF cleanup/rejection pass | MIME/signature mismatch with traversal name and oversized upload rejected; authorized/foreign downloads verified | Equipment and document failure paths pass | P0 | PASS |

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
