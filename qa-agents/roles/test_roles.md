# Fleet Test Roles (Personas)

These are the **test roles** we log in as while testing — distinct from
the QA **agent roles** (the testing specialists). Each persona maps to a
Fleet app role within a tenant, with explicit allowed/forbidden actions.
tenant_b roles are used mainly for cross-tenant / direct-ID access tests.

| Role ID | App Role | Tenant | Risk Focus |
| --- | --- | --- | --- |
| admin_tenant_a | admin | tenant_a | Tenant isolation, Privilege scope |
| boss_tenant_a | boss | tenant_a | Finance visibility, Approval auditability |
| accounting_tenant_a | accounting | tenant_a | Finance data scope, Operational separation of duties |
| office_tenant_a | office | tenant_a | Finance data leakage, Private document exposure, Tenant isolation |
| driver_tenant_a_1 | driver | tenant_a | Driver privilege escalation, Cross-driver data access |
| driver_tenant_a_2 | driver | tenant_a | Driver-to-driver isolation |
| admin_tenant_b | admin | tenant_b | Cross-tenant isolation (from tenant_b side) |
| office_tenant_b | office | tenant_b | Office restrictions, Tenant isolation |
| driver_tenant_b_1 | driver | tenant_b | Driver isolation, Tenant boundary (direct-ID access) |

## admin_tenant_a

- **App role:** admin
- **Tenant:** tenant_a
- **Description:** Full administrator of tenant_a; manages system data.
- **Allowed actions:**
  - Manage drivers, vehicles, documents, assignments
  - View finance/revenue data for tenant_a
  - Manage users within tenant_a
- **Forbidden actions:**
  - Access any tenant_b record
- **Risk focus:**
  - Tenant isolation
  - Privilege scope

## boss_tenant_a

- **App role:** boss
- **Tenant:** tenant_a
- **Description:** Owner/manager with broad but auditable access in tenant_a.
- **Allowed actions:**
  - View finance/revenue and operational data for tenant_a
  - Approve leave and assignments
- **Forbidden actions:**
  - Access tenant_b records
  - Perform untracked/unauditable changes
- **Risk focus:**
  - Finance visibility
  - Approval auditability

## accounting_tenant_a

- **App role:** accounting
- **Tenant:** tenant_a
- **Description:** Finance/accounting user for tenant_a.
- **Allowed actions:**
  - View finance/accounting data for tenant_a
  - Manage billing/invoicing data within scope
- **Forbidden actions:**
  - Change operational assignments unless explicitly allowed
  - Access tenant_b records
- **Risk focus:**
  - Finance data scope
  - Operational separation of duties

## office_tenant_a

- **App role:** office
- **Tenant:** tenant_a
- **Description:** Operational office user for tenant_a.
- **Allowed actions:**
  - View and manage operational data (drivers, vehicles, assignments)
- **Forbidden actions:**
  - View finance/revenue/cost data
  - Access private driver salary/medical documents
  - Manage users
  - Access tenant_b records
- **Risk focus:**
  - Finance data leakage
  - Private document exposure
  - Tenant isolation

## driver_tenant_a_1

- **App role:** driver
- **Tenant:** tenant_a
- **Description:** Driver in tenant_a (mobile/app user).
- **Allowed actions:**
  - Access own mobile/app data (own assignments, own documents, own check-ins)
- **Forbidden actions:**
  - Access the web admin dashboard
  - Access other drivers' documents
  - Access finance data
  - Access tenant_b records
- **Risk focus:**
  - Driver privilege escalation
  - Cross-driver data access

## driver_tenant_a_2

- **App role:** driver
- **Tenant:** tenant_a
- **Description:** Second driver in tenant_a, for driver-to-driver isolation tests.
- **Allowed actions:**
  - Access only own assignments and own documents
- **Forbidden actions:**
  - Access driver_tenant_a_1's data
  - Access the web admin dashboard
  - Access tenant_b records
- **Risk focus:**
  - Driver-to-driver isolation

## admin_tenant_b

- **App role:** admin
- **Tenant:** tenant_b
- **Description:** Administrator of tenant_b; used for cross-tenant testing.
- **Allowed actions:**
  - Manage all tenant_b records
- **Forbidden actions:**
  - Access any tenant_a record
- **Risk focus:**
  - Cross-tenant isolation (from tenant_b side)

## office_tenant_b

- **App role:** office
- **Tenant:** tenant_b
- **Description:** Operational office user for tenant_b; cross-tenant testing.
- **Allowed actions:**
  - View and manage operational data for tenant_b
- **Forbidden actions:**
  - View finance data
  - Access private driver documents
  - Access tenant_a records
- **Risk focus:**
  - Office restrictions
  - Tenant isolation

## driver_tenant_b_1

- **App role:** driver
- **Tenant:** tenant_b
- **Description:** Driver in tenant_b; used for direct-ID cross-tenant access tests.
- **Allowed actions:**
  - Access only own assignments and own documents
- **Forbidden actions:**
  - Access the web admin dashboard
  - Access any tenant_a record
- **Risk focus:**
  - Driver isolation
  - Tenant boundary (direct-ID access)
