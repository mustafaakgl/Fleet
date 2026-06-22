"""Full-system exploratory test matrix builder.

For each discovered module this generates exploratory test scenarios across the
canonical testing principles, plus curated module-specific scenarios for the
highest-risk modules (documents, einsatzplan, requests, export, auth).

Each matrix item is a dict:
    id, module, risk_level, principle, category, role, scenario,
    expected_result, evidence_needed (list), suggested_agent_type

Deterministic; no OpenAI calls.
"""

from __future__ import annotations

# Canonical testing principles applied to every module.
PRINCIPLES = [
    "Risk-Based Testing",
    "Charter-Based Exploratory Testing",
    "Happy Path + Sad Path",
    "Role-Based Testing",
    "Boundary and Edge Case Testing",
    "Data Integrity",
    "Cross-Module Effects",
    "Evidence-Based Bug Reporting",
    "Regression Thinking",
]

# Principle -> (category, suggested_agent_type, default test role).
PRINCIPLE_MAP: dict[str, tuple[str, str, str]] = {
    "Risk-Based Testing": ("Security", "Security Abuse Agent", "driver_tenant_a_1"),
    "Charter-Based Exploratory Testing": (
        "Business Flow",
        "Business Flow Agent",
        "admin_tenant_a",
    ),
    "Happy Path + Sad Path": (
        "Forms & Validation",
        "Forms & Validation Agent",
        "office_tenant_a",
    ),
    "Role-Based Testing": ("Auth & RBAC", "Auth & RBAC Agent", "office_tenant_a"),
    "Boundary and Edge Case Testing": (
        "Forms & Validation",
        "Forms & Validation Agent",
        "office_tenant_a",
    ),
    "Data Integrity": ("Data Integrity", "Data Integrity Agent", "admin_tenant_a"),
    "Cross-Module Effects": (
        "Business Flow",
        "Business Flow Agent",
        "admin_tenant_a",
    ),
    "Evidence-Based Bug Reporting": (
        "UI/UX",
        "UI/UX Agent",
        "office_tenant_a",
    ),
    "Regression Thinking": ("Regression", "Regression Agent", "admin_tenant_a"),
}

# Standard evidence bundle requested for most scenarios.
_STANDARD_EVIDENCE = [
    "Screenshot of the UI state",
    "Network/API request and response",
]
_DATA_EVIDENCE = _STANDARD_EVIDENCE + ["DB record or export sample"]

# Curated, high-signal module-specific scenarios. Each entry omits id/risk_level
# (those are filled in from the discovered module).
MODULE_SCENARIOS: dict[str, list[dict]] = {
    "documents": [
        {
            "principle": "Role-Based Testing",
            "category": "Auth & RBAC",
            "role": "office_tenant_a",
            "scenario": "Office role attempts to view private driver salary/medical documents.",
            "expected_result": "Access is denied; private documents are never shown to office.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Auth & RBAC Agent",
        },
        {
            "principle": "Risk-Based Testing",
            "category": "Security",
            "role": "office_tenant_b",
            "scenario": "Direct-ID access to another tenant's document via URL/API.",
            "expected_result": "Request is rejected; no cross-tenant document is returned.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Security Abuse Agent",
        },
        {
            "principle": "Data Integrity",
            "category": "Data Integrity",
            "role": "admin_tenant_a",
            "scenario": "Owner-type mismatch between a document and its owner.",
            "expected_result": "Document is bound to the correct owner type; mismatches are rejected.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Data Integrity Agent",
        },
        {
            "principle": "Cross-Module Effects",
            "category": "Business Flow",
            "role": "admin_tenant_a",
            "scenario": "Expired document should drive a compliance reminder.",
            "expected_result": "An expiry creates the expected reminder/notification.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Business Flow Agent",
        },
        {
            "principle": "Happy Path + Sad Path",
            "category": "Forms & Validation",
            "role": "office_tenant_a",
            "scenario": "Upload an unsupported file type.",
            "expected_result": "Upload is rejected with a clear validation error.",
            "evidence_needed": _STANDARD_EVIDENCE,
            "suggested_agent_type": "Forms & Validation Agent",
        },
        {
            "principle": "Boundary and Edge Case Testing",
            "category": "Forms & Validation",
            "role": "office_tenant_a",
            "scenario": "Upload a file with a 300+ character file name.",
            "expected_result": "Name is rejected or safely truncated; no crash or corruption.",
            "evidence_needed": _STANDARD_EVIDENCE,
            "suggested_agent_type": "Forms & Validation Agent",
        },
        {
            "principle": "Regression Thinking",
            "category": "Regression",
            "role": "admin_tenant_a",
            "scenario": "Renewing a document should clear the stale reminder.",
            "expected_result": "Old reminder is cleared and a fresh expiry cycle starts.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Regression Agent",
        },
    ],
    "einsatzplan": [
        {
            "principle": "Data Integrity",
            "category": "Data Integrity",
            "role": "admin_tenant_a",
            "scenario": "Driver assigned without the correct license class.",
            "expected_result": "Assignment is blocked or flagged; license rules are enforced.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Data Integrity Agent",
        },
        {
            "principle": "Boundary and Edge Case Testing",
            "category": "Business Flow",
            "role": "admin_tenant_a",
            "scenario": "Same driver assigned to overlapping jobs.",
            "expected_result": "Overlap is detected and prevented or clearly warned.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Business Flow Agent",
        },
        {
            "principle": "Cross-Module Effects",
            "category": "Business Flow",
            "role": "admin_tenant_a",
            "scenario": "Leave day conflicts with an assignment.",
            "expected_result": "Conflict is surfaced; assignment respects approved leave.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Business Flow Agent",
        },
        {
            "principle": "Cross-Module Effects",
            "category": "Business Flow",
            "role": "admin_tenant_a",
            "scenario": "Assignment update should update the calendar.",
            "expected_result": "Calendar reflects the assignment change immediately.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Business Flow Agent",
        },
        {
            "principle": "Data Integrity",
            "category": "Data Integrity",
            "role": "accounting_tenant_a",
            "scenario": "Daily overview export should match the assignments.",
            "expected_result": "Export rows exactly match the on-screen assignments.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Data Integrity Agent",
        },
    ],
    "requests": [
        {
            "principle": "Cross-Module Effects",
            "category": "Business Flow",
            "role": "office_tenant_a",
            "scenario": "Leave approval creates a calendar event.",
            "expected_result": "Approval produces the expected calendar event.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Business Flow Agent",
        },
        {
            "principle": "Happy Path + Sad Path",
            "category": "Business Flow",
            "role": "office_tenant_a",
            "scenario": "Rejected request should not create a calendar event.",
            "expected_result": "No calendar event is created for a rejected request.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Business Flow Agent",
        },
        {
            "principle": "Boundary and Edge Case Testing",
            "category": "Business Flow",
            "role": "office_tenant_a",
            "scenario": "Overlapping leave request.",
            "expected_result": "Overlap is detected and handled per business rules.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Business Flow Agent",
        },
        {
            "principle": "Role-Based Testing",
            "category": "Auth & RBAC",
            "role": "office_tenant_a",
            "scenario": "Office role approval permissions.",
            "expected_result": "Office can only approve what its role permits.",
            "evidence_needed": _STANDARD_EVIDENCE,
            "suggested_agent_type": "Auth & RBAC Agent",
        },
    ],
    "export": [
        {
            "principle": "Data Integrity",
            "category": "Data Integrity",
            "role": "admin_tenant_a",
            "scenario": "Export should match the UI.",
            "expected_result": "Exported data exactly matches what the UI shows.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Data Integrity Agent",
        },
        {
            "principle": "Role-Based Testing",
            "category": "Auth & RBAC",
            "role": "office_tenant_a",
            "scenario": "Office role should not export finance data.",
            "expected_result": "Finance columns/exports are unavailable to office.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Auth & RBAC Agent",
        },
        {
            "principle": "Boundary and Edge Case Testing",
            "category": "Forms & Validation",
            "role": "office_tenant_a",
            "scenario": "Empty-day export should not fail.",
            "expected_result": "Empty export produces a valid, empty file without error.",
            "evidence_needed": _STANDARD_EVIDENCE,
            "suggested_agent_type": "Forms & Validation Agent",
        },
        {
            "principle": "Boundary and Edge Case Testing",
            "category": "Data Integrity",
            "role": "office_tenant_a",
            "scenario": "Special characters should export correctly.",
            "expected_result": "Unicode/special characters render correctly in the export.",
            "evidence_needed": _DATA_EVIDENCE,
            "suggested_agent_type": "Data Integrity Agent",
        },
    ],
    "auth": [
        {
            "principle": "Regression Thinking",
            "category": "Security",
            "role": "office_tenant_a",
            "scenario": "Logout then browser back.",
            "expected_result": "Protected pages are not accessible after logout via back button.",
            "evidence_needed": _STANDARD_EVIDENCE,
            "suggested_agent_type": "Security Abuse Agent",
        },
        {
            "principle": "Risk-Based Testing",
            "category": "Security",
            "role": "driver_tenant_a_1",
            "scenario": "Direct URL access to a protected page.",
            "expected_result": "Unauthorized direct access is blocked/redirected.",
            "evidence_needed": _STANDARD_EVIDENCE,
            "suggested_agent_type": "Security Abuse Agent",
        },
        {
            "principle": "Role-Based Testing",
            "category": "Auth & RBAC",
            "role": "driver_tenant_a_1",
            "scenario": "Driver attempts to open the admin dashboard.",
            "expected_result": "Driver is denied access to the web admin dashboard.",
            "evidence_needed": _STANDARD_EVIDENCE,
            "suggested_agent_type": "Auth & RBAC Agent",
        },
        {
            "principle": "Role-Based Testing",
            "category": "Auth & RBAC",
            "role": "office_tenant_a",
            "scenario": "Office attempts to open a finance route.",
            "expected_result": "Office is denied access to finance routes.",
            "evidence_needed": _STANDARD_EVIDENCE,
            "suggested_agent_type": "Auth & RBAC Agent",
        },
    ],
}


def _generic_scenario(module: str, principle: str) -> dict:
    """Build a generic scenario for a module + principle."""
    category, agent_type, role = PRINCIPLE_MAP[principle]
    return {
        "principle": principle,
        "category": category,
        "role": role,
        "scenario": (
            f"Apply {principle} to the {module} module: explore for "
            f"{category.lower()} concerns and capture evidence."
        ),
        "expected_result": (
            "Behavior matches Fleet business rules and the role's "
            "allowed/forbidden actions; no data leak or loss."
        ),
        "evidence_needed": list(_STANDARD_EVIDENCE),
        "suggested_agent_type": agent_type,
    }


def build_test_matrix(
    discovered_modules: list[dict], test_roles: list[dict]
) -> list[dict]:
    """Build the full-system test matrix from discovered modules and roles.

    For each module: emit curated module-specific scenarios first (when defined),
    then one generic scenario per testing principle. IDs are assigned globally as
    ``TM-001``, ``TM-002``, ...
    """
    # Set of valid role ids so curated scenarios stay consistent with personas.
    valid_roles = {role["role_id"] for role in test_roles}

    matrix: list[dict] = []
    counter = 1
    for entry in discovered_modules:
        module = entry["module"]
        risk_level = entry["risk_level"]

        scenarios: list[dict] = []
        scenarios.extend(MODULE_SCENARIOS.get(module, []))
        for principle in PRINCIPLES:
            scenarios.append(_generic_scenario(module, principle))

        for scenario in scenarios:
            role = scenario["role"]
            if role not in valid_roles:
                role = "admin_tenant_a"
            matrix.append(
                {
                    "id": f"TM-{counter:03d}",
                    "module": module,
                    "risk_level": risk_level,
                    "principle": scenario["principle"],
                    "category": scenario["category"],
                    "role": role,
                    "scenario": scenario["scenario"],
                    "expected_result": scenario["expected_result"],
                    "evidence_needed": list(scenario["evidence_needed"]),
                    "suggested_agent_type": scenario["suggested_agent_type"],
                }
            )
            counter += 1

    return matrix
