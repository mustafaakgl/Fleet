"""Test role / persona definitions for full-system exploratory testing.

These are **test roles** (who we log in as while testing) — not the QA agent
roles (the testing specialists). Each persona maps to a Fleet app role in a
specific tenant, with explicit allowed/forbidden actions and a risk focus.

tenant_b roles exist mainly for cross-tenant / direct-ID access testing.
No OpenAI calls.
"""

from __future__ import annotations

# Each role: role_id + app_role + tenant + description + allowed/forbidden +
# risk_focus (list of focus areas).
TEST_ROLES: list[dict] = [
    {
        "role_id": "admin_tenant_a",
        "app_role": "admin",
        "tenant": "tenant_a",
        "description": "Full administrator of tenant_a; manages system data.",
        "allowed_actions": [
            "Manage drivers, vehicles, documents, assignments",
            "View finance/revenue data for tenant_a",
            "Manage users within tenant_a",
        ],
        "forbidden_actions": [
            "Access any tenant_b record",
        ],
        "risk_focus": [
            "Tenant isolation",
            "Privilege scope",
        ],
    },
    {
        "role_id": "boss_tenant_a",
        "app_role": "boss",
        "tenant": "tenant_a",
        "description": "Owner/manager with broad but auditable access in tenant_a.",
        "allowed_actions": [
            "View finance/revenue and operational data for tenant_a",
            "Approve leave and assignments",
        ],
        "forbidden_actions": [
            "Access tenant_b records",
            "Perform untracked/unauditable changes",
        ],
        "risk_focus": [
            "Finance visibility",
            "Approval auditability",
        ],
    },
    {
        "role_id": "accounting_tenant_a",
        "app_role": "accounting",
        "tenant": "tenant_a",
        "description": "Finance/accounting user for tenant_a.",
        "allowed_actions": [
            "View finance/accounting data for tenant_a",
            "Manage billing/invoicing data within scope",
        ],
        "forbidden_actions": [
            "Change operational assignments unless explicitly allowed",
            "Access tenant_b records",
        ],
        "risk_focus": [
            "Finance data scope",
            "Operational separation of duties",
        ],
    },
    {
        "role_id": "office_tenant_a",
        "app_role": "office",
        "tenant": "tenant_a",
        "description": "Operational office user for tenant_a.",
        "allowed_actions": [
            "View and manage operational data (drivers, vehicles, assignments)",
        ],
        "forbidden_actions": [
            "View finance/revenue/cost data",
            "Access private driver salary/medical documents",
            "Manage users",
            "Access tenant_b records",
        ],
        "risk_focus": [
            "Finance data leakage",
            "Private document exposure",
            "Tenant isolation",
        ],
    },
    {
        "role_id": "driver_tenant_a_1",
        "app_role": "driver",
        "tenant": "tenant_a",
        "description": "Driver in tenant_a (mobile/app user).",
        "allowed_actions": [
            "Access own mobile/app data (own assignments, own documents, own check-ins)",
        ],
        "forbidden_actions": [
            "Access the web admin dashboard",
            "Access other drivers' documents",
            "Access finance data",
            "Access tenant_b records",
        ],
        "risk_focus": [
            "Driver privilege escalation",
            "Cross-driver data access",
        ],
    },
    {
        "role_id": "driver_tenant_a_2",
        "app_role": "driver",
        "tenant": "tenant_a",
        "description": "Second driver in tenant_a, for driver-to-driver isolation tests.",
        "allowed_actions": [
            "Access only own assignments and own documents",
        ],
        "forbidden_actions": [
            "Access driver_tenant_a_1's data",
            "Access the web admin dashboard",
            "Access tenant_b records",
        ],
        "risk_focus": [
            "Driver-to-driver isolation",
        ],
    },
    {
        "role_id": "admin_tenant_b",
        "app_role": "admin",
        "tenant": "tenant_b",
        "description": "Administrator of tenant_b; used for cross-tenant testing.",
        "allowed_actions": [
            "Manage all tenant_b records",
        ],
        "forbidden_actions": [
            "Access any tenant_a record",
        ],
        "risk_focus": [
            "Cross-tenant isolation (from tenant_b side)",
        ],
    },
    {
        "role_id": "office_tenant_b",
        "app_role": "office",
        "tenant": "tenant_b",
        "description": "Operational office user for tenant_b; cross-tenant testing.",
        "allowed_actions": [
            "View and manage operational data for tenant_b",
        ],
        "forbidden_actions": [
            "View finance data",
            "Access private driver documents",
            "Access tenant_a records",
        ],
        "risk_focus": [
            "Office restrictions",
            "Tenant isolation",
        ],
    },
    {
        "role_id": "driver_tenant_b_1",
        "app_role": "driver",
        "tenant": "tenant_b",
        "description": "Driver in tenant_b; used for direct-ID cross-tenant access tests.",
        "allowed_actions": [
            "Access only own assignments and own documents",
        ],
        "forbidden_actions": [
            "Access the web admin dashboard",
            "Access any tenant_a record",
        ],
        "risk_focus": [
            "Driver isolation",
            "Tenant boundary (direct-ID access)",
        ],
    },
]


def create_test_roles() -> list[dict]:
    """Return the list of test role/persona definitions (deep-copied dicts)."""
    return [
        {
            "role_id": role["role_id"],
            "app_role": role["app_role"],
            "tenant": role["tenant"],
            "description": role["description"],
            "allowed_actions": list(role["allowed_actions"]),
            "forbidden_actions": list(role["forbidden_actions"]),
            "risk_focus": list(role["risk_focus"]),
        }
        for role in TEST_ROLES
    ]
