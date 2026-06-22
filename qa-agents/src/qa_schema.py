"""Structured exploratory-QA schema, formatting helpers, and dry-run data.

Phase 4: principles-based exploratory testing. This module centralizes:
- The canonical exploratory report schema every agent follows.
- Formatting helpers used to render structured reports.
- Realistic, module-specific dry-run data expressed as **Test Ideas**,
  **Risks**, and **Bug Candidates** — never as confirmed bugs.

Honesty rule: in dry-run mode nothing is a confirmed bug. Every dry-run finding
is marked `DRY RUN - NEEDS MANUAL VERIFICATION`. The real-LLM path (in graph.py)
injects `SCHEMA_INSTRUCTIONS` / `FINAL_REPORT_INSTRUCTIONS` so the model
produces the same structure and the same evidence-based honesty.

Nothing here calls OpenAI.
"""

from __future__ import annotations

from principles_loader import PRINCIPLE_NAMES

# ---------------------------------------------------------------------------
# Agent metadata.
# ---------------------------------------------------------------------------
AGENT_CHARTERS: dict[str, str] = {
    "orchestrator": "Plan the highest-risk areas to test for the module.",
    "auth_rbac_agent": (
        "Explore authentication, role-based access control, and data visibility "
        "— who can see and do what, including direct URL/API bypass."
    ),
    "data_integrity_agent": (
        "Explore data correctness: owner binding, lifecycle/expiry states, "
        "duplicates, and derived data such as reminders."
    ),
    "forms_validation_agent": (
        "Explore form input validation, file uploads, and boundary handling on "
        "both frontend and backend."
    ),
    "business_flow_agent": (
        "Explore end-to-end business workflows and cross-module side effects."
    ),
    "ui_ux_agent": (
        "Explore UI behavior, navigation, filtering, and refresh/back "
        "consistency."
    ),
}

AGENT_DISPLAY_NAMES: dict[str, str] = {
    "auth_rbac_agent": "Auth & RBAC",
    "data_integrity_agent": "Data Integrity",
    "forms_validation_agent": "Forms & Validation",
    "business_flow_agent": "Business Flow",
    "ui_ux_agent": "UI/UX",
}

# Marker for every dry-run finding. In dry-run NOTHING is a confirmed bug.
DRY_RUN_MARK = "DRY RUN - NEEDS MANUAL VERIFICATION"

# Valid finding categories (evidence-based bug reporting principle).
CATEGORIES = (
    "Bug Candidate",
    "Risk",
    "Test Idea",
    "UX Issue",
    "Question",
)

# ---------------------------------------------------------------------------
# Schema instructions injected into the REAL-LLM prompts.
# ---------------------------------------------------------------------------
SCHEMA_INSTRUCTIONS = """
You MUST apply the Fleet QA Testing Principles you were given. Be honest and
evidence-based: do NOT call something a Confirmed Bug unless the provided source
context is clear evidence. Otherwise classify it as a Bug Candidate, Risk, Test
Idea, UX Issue, or Question. Do NOT invent files, endpoints, or behavior that is
not supported by the context.

OUTPUT FORMAT (MANDATORY). Produce your report using EXACTLY this structure:

# Exploratory Agent Report — [agent_name]

## Module
[module]

## Applied Testing Principles
- list the principle names you actually applied (from the principles document)

## Session Charter
One short paragraph: what you are testing and which risks you are exploring.

## Risk Focus
- bullet points of the highest risks this agent targets

## Exploratory Test Ideas
For each idea include:
- ID
- Principle (which principle drives it)
- Role
- Scenario
- Steps
- Expected Result
- Evidence Needed
- Status: Needs manual verification

## Bug Candidates
For each item include:
- ID
- Title
- Category: Bug Candidate / Risk / Test Idea / UX Issue / Question
- Severity (Critical/High/Medium/Low)
- Priority (P0/P1/P2/P3)
- Role
- Preconditions
- Steps to Reproduce
- Expected Result
- Actual Result or Suspected Issue
- Evidence Needed
- Status

## Data Integrity Checks
- bullet points

## RBAC Checks
- bullet points

## Regression Checklist
- bullet points

## Agent Recommendation
Go / No-Go / Needs manual verification (with one line of reasoning)
"""

FINAL_REPORT_INSTRUCTIONS = """
You MUST produce an evidence-based exploratory report. Confirmed Bugs may ONLY
contain items with clear evidence; if there is no evidence, that section stays
empty and the item belongs under Bug Candidates, Risks, or Test Ideas.

OUTPUT FORMAT (MANDATORY). Produce the final report using EXACTLY this structure:

# Exploratory QA Report — [module]

## Execution Mode
DRY RUN or REAL LLM

## Session Charter
One short paragraph.

## Testing Principles Applied
A markdown table with the header:
| Principle | Covered? | Where |
|---|---|---|

## Selected Agents
- bullet list

## Executive Summary
Short summary.

## Confirmed Bugs
Only real bugs with evidence. In dry-run mode this MUST be empty.

## Bug Candidates
A markdown table with the header:
| ID | Severity | Priority | Agent | Title | Status |
|---|---|---|---|---|---|

## Risks
- bullet points

## Test Ideas
- bullet points

## UX Issues
- bullet points

## Questions / Requirement Gaps
- bullet points

## Manual Exploratory Test Checklist
- bullet points

## Regression Checklist
- bullet points

## Final Recommendation
One line.
"""


# ---------------------------------------------------------------------------
# Formatting helpers.
# ---------------------------------------------------------------------------
def _numbered(items: list[str]) -> str:
    return "\n".join(f"    {i}. {s}" for i, s in enumerate(items, start=1))


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {i}" for i in items) if items else "- (none)"


def format_test_idea(idea: dict) -> str:
    """Render a single exploratory test idea dict as markdown."""
    return (
        f"- **ID:** {idea.get('id', '')}\n"
        f"  - **Principle:** {idea.get('principle', '')}\n"
        f"  - **Role:** {idea.get('role', '')}\n"
        f"  - **Scenario:** {idea.get('scenario', '')}\n"
        f"  - **Steps:**\n{_numbered(idea.get('steps', []))}\n"
        f"  - **Expected Result:** {idea.get('expected', '')}\n"
        f"  - **Evidence Needed:** {idea.get('evidence', '')}\n"
        f"  - **Status:** Needs manual verification"
    )


def format_bug_candidate(bug: dict) -> str:
    """Render a single bug-candidate dict as markdown."""
    return (
        f"- **ID:** {bug.get('id', '')}\n"
        f"  - **Title:** {bug.get('title', '')}\n"
        f"  - **Category:** {bug.get('category', 'Bug Candidate')}\n"
        f"  - **Severity:** {bug.get('severity', '')}\n"
        f"  - **Priority:** {bug.get('priority', '')}\n"
        f"  - **Role:** {bug.get('role', '')}\n"
        f"  - **Preconditions:** {bug.get('preconditions', '')}\n"
        f"  - **Steps to Reproduce:**\n{_numbered(bug.get('steps', []))}\n"
        f"  - **Expected Result:** {bug.get('expected', '')}\n"
        f"  - **Actual Result or Suspected Issue:** {bug.get('actual', '')}\n"
        f"  - **Evidence Needed:** {bug.get('evidence', '')}\n"
        f"  - **Status:** {bug.get('status', DRY_RUN_MARK)}"
    )


def format_agent_report(agent_name: str, module: str, data: dict) -> str:
    """Render a full structured exploratory agent report from a data dict."""
    charter = data.get("charter") or AGENT_CHARTERS.get(agent_name, "")
    principles_md = _bullets(data.get("applied_principles", []))
    risk_md = _bullets(data.get("risk_focus", []))
    ideas_md = "\n".join(format_test_idea(t) for t in data.get("test_ideas", []))
    bugs_md = "\n".join(format_bug_candidate(b) for b in data.get("bugs", []))
    data_checks_md = _bullets(data.get("data_integrity_checks", []))
    rbac_md = _bullets(data.get("rbac_checks", []))
    regression_md = _bullets(data.get("regression", []))
    recommendation = data.get("recommendation", "Needs manual verification")

    return (
        f"# Exploratory Agent Report — {agent_name}\n\n"
        f"## Module\n{module}\n\n"
        f"## Applied Testing Principles\n{principles_md}\n\n"
        f"## Session Charter\n{charter}\n\n"
        f"## Risk Focus\n{risk_md}\n\n"
        f"## Exploratory Test Ideas\n{ideas_md or '- (none)'}\n\n"
        f"## Bug Candidates\n{bugs_md or '- (none)'}\n\n"
        f"## Data Integrity Checks\n{data_checks_md}\n\n"
        f"## RBAC Checks\n{rbac_md}\n\n"
        f"## Regression Checklist\n{regression_md}\n\n"
        f"## Agent Recommendation\n{recommendation}"
    )


# ---------------------------------------------------------------------------
# Dry-run mock data — module specific. Everything here is a Test Idea, Risk, or
# Bug Candidate. NOTHING is a confirmed bug.
# ---------------------------------------------------------------------------
def _documents_findings(module: str) -> dict:
    """Realistic, agent-specific dry-run findings for the `documents` module."""
    return {
        "auth_rbac_agent": {
            "applied_principles": [
                "Risk-Based Testing",
                "Charter-Based Exploratory Testing",
                "Role-Based Testing",
                "Evidence-Based Bug Reporting",
            ],
            "risk_focus": [
                "Unauthorized access to private driver documents.",
                "Cross-tenant document leakage via direct ID / deep filters.",
                "Role-based document visibility (admin/boss/accounting/office/driver).",
            ],
            "test_ideas": [
                {
                    "id": "DRY-DOC-AUTH-TI-001",
                    "principle": "Role-Based Testing",
                    "role": "office",
                    "scenario": "Office role attempts to view private driver documents.",
                    "steps": [
                        "Log in as office.",
                        "Filter documents by ownerType=driver, category=medical.",
                        "Try to open a driver medical document detail/download.",
                    ],
                    "expected": "Private driver documents are hidden from office.",
                    "evidence": "API response + screenshot of denied/empty result.",
                },
                {
                    "id": "DRY-DOC-AUTH-TI-002",
                    "principle": "Risk-Based Testing",
                    "role": "office",
                    "scenario": "Direct-ID access to another tenant's document.",
                    "steps": [
                        "Log in as office of tenant A.",
                        "GET /documents/<tenant-B-document-id> directly.",
                    ],
                    "expected": "403/404 — tenant scope enforced at the API.",
                    "evidence": "Request/response logs showing tenant mismatch.",
                },
            ],
            "bugs": [
                {
                    "id": "DRY-DOC-AUTH-001",
                    "title": "Office role may view driver medical documents via deep filter URL",
                    "category": "Bug Candidate",
                    "severity": "High",
                    "priority": "P1",
                    "role": "office",
                    "preconditions": "A driver has a medical certificate uploaded.",
                    "steps": [
                        "Log in as office.",
                        "Navigate to /documents?ownerType=driver&category=medical.",
                        "Open a returned document detail.",
                    ],
                    "expected": "Office is blocked from private driver documents.",
                    "actual": "Suspected: detail/download may be accessible (verify).",
                    "evidence": "API payload + screenshot of detail view.",
                    "status": DRY_RUN_MARK,
                },
                {
                    "id": "DRY-DOC-AUTH-002",
                    "title": "Document detail endpoint may leak cross-tenant document by direct ID",
                    "category": "Risk",
                    "severity": "Critical",
                    "priority": "P0",
                    "role": "office",
                    "preconditions": "Two tenants each own documents.",
                    "steps": [
                        "Log in as office of tenant A.",
                        "GET /documents/<tenant-B-document-id>.",
                    ],
                    "expected": "403/404 — tenant scope enforced.",
                    "actual": "Suspected IDOR if tenant scope is missing (verify).",
                    "evidence": "Request/response logs showing tenant mismatch.",
                    "status": DRY_RUN_MARK,
                },
            ],
            "data_integrity_checks": [
                "Document download URL re-checks role and tenant on access.",
                "List vs detail vs API expose the same visibility rules.",
            ],
            "rbac_checks": [
                "Office cannot reach driver private documents (menu, filter, API).",
                "Driver cannot reach the admin/web document dashboard.",
                "Permissions enforced at the API layer, not only the frontend.",
            ],
            "regression": [
                "Re-test office/driver visibility after any RBAC change.",
                "Re-test cross-tenant document access after multi-tenant changes.",
            ],
            "recommendation": "Needs manual verification",
        },
        "data_integrity_agent": {
            "applied_principles": [
                "Data Integrity",
                "Cross-Module Effects",
                "Boundary and Edge Case Testing",
                "Evidence-Based Bug Reporting",
            ],
            "risk_focus": [
                "Document attached to the wrong owner type.",
                "Expired documents that do not generate reminders.",
                "Duplicate uploads creating parallel reminder chains.",
            ],
            "test_ideas": [
                {
                    "id": "DRY-DOC-DATA-TI-001",
                    "principle": "Data Integrity",
                    "role": "admin",
                    "scenario": "Owner-type mismatch between document and owner.",
                    "steps": [
                        "Upload a vehicle inspection document.",
                        "Submit ownerType=driver via the API.",
                    ],
                    "expected": "Owner-type/category mismatch is rejected.",
                    "evidence": "DB row showing ownerType vs category.",
                },
                {
                    "id": "DRY-DOC-DATA-TI-002",
                    "principle": "Cross-Module Effects",
                    "role": "admin",
                    "scenario": "Expired document should drive a compliance reminder.",
                    "steps": [
                        "Set a document expiry to the past.",
                        "Run the reminder generation job.",
                    ],
                    "expected": "A compliance reminder is created for the owner.",
                    "evidence": "Reminder table before/after the job.",
                },
            ],
            "bugs": [
                {
                    "id": "DRY-DOC-DATA-001",
                    "title": "Vehicle document may be bound to a driver owner",
                    "category": "Bug Candidate",
                    "severity": "High",
                    "priority": "P1",
                    "role": "admin",
                    "preconditions": "A vehicle and a driver exist.",
                    "steps": [
                        "Upload a vehicle document.",
                        "Submit with ownerType=driver via the API.",
                    ],
                    "expected": "Owner-type mismatch is rejected.",
                    "actual": "Suspected: document stored against the driver (verify).",
                    "evidence": "DB row showing ownerType vs category mismatch.",
                    "status": DRY_RUN_MARK,
                },
                {
                    "id": "DRY-DOC-DATA-002",
                    "title": "Expired document may not generate a compliance reminder",
                    "category": "Bug Candidate",
                    "severity": "High",
                    "priority": "P1",
                    "role": "admin",
                    "preconditions": "A document with an expiry date in the past.",
                    "steps": [
                        "Set a document expiry date to the past.",
                        "Run reminder generation.",
                    ],
                    "expected": "A reminder is created for the owner.",
                    "actual": "Suspected: no reminder generated (verify).",
                    "evidence": "Reminder table contents before/after the job.",
                    "status": DRY_RUN_MARK,
                },
                {
                    "id": "DRY-DOC-DATA-003",
                    "title": "Duplicate upload may create two parallel reminder chains",
                    "category": "Risk",
                    "severity": "Medium",
                    "priority": "P2",
                    "role": "admin",
                    "preconditions": "The same document can be uploaded twice.",
                    "steps": [
                        "Upload the same document twice.",
                        "Run reminder generation.",
                    ],
                    "expected": "One reminder chain per logical document.",
                    "actual": "Suspected: two reminder chains created (verify).",
                    "evidence": "Reminder rows referencing duplicate document ids.",
                    "status": DRY_RUN_MARK,
                },
            ],
            "data_integrity_checks": [
                "List, detail, API, and export show the same owner/expiry.",
                "Expiry boundary (today vs end-of-day) handled consistently.",
                "Re-upload supersedes the previous document's reminders.",
            ],
            "rbac_checks": [
                "Only authorized roles can change a document's owner binding.",
            ],
            "regression": [
                "Re-verify reminder generation after document model changes.",
                "Re-verify owner-binding validation after upload refactors.",
            ],
            "recommendation": "Needs manual verification",
        },
        "forms_validation_agent": {
            "applied_principles": [
                "Boundary and Edge Case Testing",
                "Happy Path + Sad Path",
                "Evidence-Based Bug Reporting",
            ],
            "risk_focus": [
                "Unsupported file types stored as documents.",
                "Large files and very long file names breaking upload.",
                "Frontend-only validation bypassable via direct API.",
            ],
            "test_ideas": [
                {
                    "id": "DRY-DOC-FORM-TI-001",
                    "principle": "Boundary and Edge Case Testing",
                    "role": "admin",
                    "scenario": "Upload an unsupported file type (.exe).",
                    "steps": [
                        "Open the document upload form.",
                        "Select an .exe file and submit via the API.",
                    ],
                    "expected": "Backend rejects unsupported file types.",
                    "evidence": "Stored file metadata + API response.",
                },
                {
                    "id": "DRY-DOC-FORM-TI-002",
                    "principle": "Boundary and Edge Case Testing",
                    "role": "admin",
                    "scenario": "Upload a file with a 300+ character name.",
                    "steps": [
                        "Upload a file with a very long name.",
                    ],
                    "expected": "Name is validated/truncated; clean success or error.",
                    "evidence": "Server log + request payload.",
                },
            ],
            "bugs": [
                {
                    "id": "DRY-DOC-FORM-001",
                    "title": "Unsupported file type (.exe) may be accepted on upload",
                    "category": "Bug Candidate",
                    "severity": "High",
                    "priority": "P1",
                    "role": "admin",
                    "preconditions": "Document upload form is reachable.",
                    "steps": [
                        "Open the document upload form.",
                        "Select an .exe file and submit via the API.",
                    ],
                    "expected": "Upload is rejected with a validation error.",
                    "actual": "Suspected: file accepted and stored (verify).",
                    "evidence": "Stored file metadata + API response.",
                    "status": DRY_RUN_MARK,
                },
                {
                    "id": "DRY-DOC-FORM-002",
                    "title": "300+ character file name may break document save",
                    "category": "Risk",
                    "severity": "Medium",
                    "priority": "P2",
                    "role": "admin",
                    "preconditions": "A file with a 300+ character name.",
                    "steps": [
                        "Upload a file with a 300+ character name.",
                    ],
                    "expected": "Name is validated/truncated; clean success or error.",
                    "actual": "Suspected: unhandled error on save (verify).",
                    "evidence": "Server error log + request payload.",
                    "status": DRY_RUN_MARK,
                },
            ],
            "data_integrity_checks": [
                "Stored file metadata matches what the form submitted.",
                "Rejected uploads leave no orphan file/record.",
            ],
            "rbac_checks": [
                "Only authorized roles can upload documents.",
            ],
            "regression": [
                "Re-test file-type allowlist after upload changes.",
                "Re-test boundary inputs after DTO/validation changes.",
            ],
            "recommendation": "Needs manual verification",
        },
        "business_flow_agent": {
            "applied_principles": [
                "Cross-Module Effects",
                "Happy Path + Sad Path",
                "Regression Thinking",
                "Evidence-Based Bug Reporting",
            ],
            "risk_focus": [
                "Driver/vehicle/company document ownership end-to-end.",
                "Reminder lifecycle (create → expire → renew).",
                "Renewed uploads superseding stale reminders.",
            ],
            "test_ideas": [
                {
                    "id": "DRY-DOC-FLOW-TI-001",
                    "principle": "Cross-Module Effects",
                    "role": "admin",
                    "scenario": "Company document expiry should notify the fleet manager.",
                    "steps": [
                        "Advance a company document to expired.",
                        "Run reminder generation.",
                    ],
                    "expected": "Fleet manager receives a compliance reminder.",
                    "evidence": "Reminder rows filtered by ownerType=company.",
                },
                {
                    "id": "DRY-DOC-FLOW-TI-002",
                    "principle": "Regression Thinking",
                    "role": "admin",
                    "scenario": "Renewing a document should clear the stale reminder.",
                    "steps": [
                        "Open an expired document with an open reminder.",
                        "Upload a renewed version with a future expiry.",
                    ],
                    "expected": "Old reminder is resolved; new expiry tracked.",
                    "evidence": "Reminder status history for the document.",
                },
            ],
            "bugs": [
                {
                    "id": "DRY-DOC-FLOW-001",
                    "title": "Company document expiry may not propagate a reminder",
                    "category": "Bug Candidate",
                    "severity": "High",
                    "priority": "P1",
                    "role": "admin",
                    "preconditions": "A company document nearing expiry.",
                    "steps": [
                        "Expire a company document.",
                        "Run reminder generation.",
                    ],
                    "expected": "Fleet manager gets a compliance reminder.",
                    "actual": "Suspected: no reminder for company-owned docs (verify).",
                    "evidence": "Reminder table filtered by ownerType=company.",
                    "status": DRY_RUN_MARK,
                },
                {
                    "id": "DRY-DOC-FLOW-002",
                    "title": "Renewed upload may not clear the stale reminder",
                    "category": "Risk",
                    "severity": "Medium",
                    "priority": "P2",
                    "role": "admin",
                    "preconditions": "An expired document with an open reminder.",
                    "steps": [
                        "Open an expired document with an active reminder.",
                        "Upload a renewed version with a future expiry.",
                    ],
                    "expected": "Old reminder is resolved automatically.",
                    "actual": "Suspected: old reminder remains open (verify).",
                    "evidence": "Reminder status history for the document.",
                    "status": DRY_RUN_MARK,
                },
            ],
            "data_integrity_checks": [
                "Reminder lifecycle stays consistent across renew/expire.",
                "Owner-type-specific reminder routing covers driver/vehicle/company.",
            ],
            "rbac_checks": [
                "Only authorized roles trigger renewals and resolve reminders.",
            ],
            "regression": [
                "Re-test company/driver/vehicle reminder routing after changes.",
                "Re-test renewal supersede logic after upload changes.",
            ],
            "recommendation": "Needs manual verification",
        },
        "ui_ux_agent": {
            "applied_principles": [
                "Happy Path + Sad Path",
                "Boundary and Edge Case Testing",
                "Evidence-Based Bug Reporting",
            ],
            "risk_focus": [
                "Refresh and browser-back behavior after upload.",
                "Deep-filter UX and state persistence on refresh.",
                "Duplicate-upload feedback and idempotency.",
            ],
            "test_ideas": [
                {
                    "id": "DRY-DOC-UX-TI-001",
                    "principle": "Happy Path + Sad Path",
                    "role": "admin",
                    "scenario": "Browser back after a successful upload.",
                    "steps": [
                        "Upload a document successfully.",
                        "Press the browser back button.",
                    ],
                    "expected": "No duplicate submission; form is reset.",
                    "evidence": "Screen recording + document rows.",
                },
                {
                    "id": "DRY-DOC-UX-TI-002",
                    "principle": "Boundary and Edge Case Testing",
                    "role": "office",
                    "scenario": "Refresh should preserve the active document filter.",
                    "steps": [
                        "Apply a category filter on the documents list.",
                        "Refresh the page.",
                    ],
                    "expected": "Filter state is preserved (e.g. via URL params).",
                    "evidence": "Before/after screenshots of the list.",
                },
            ],
            "bugs": [
                {
                    "id": "DRY-DOC-UX-001",
                    "title": "Browser back after upload may re-submit the form (duplicate upload)",
                    "category": "Bug Candidate",
                    "severity": "Medium",
                    "priority": "P2",
                    "role": "admin",
                    "preconditions": "A successful document upload.",
                    "steps": [
                        "Upload a document successfully.",
                        "Press browser back, then confirm re-submit.",
                    ],
                    "expected": "No duplicate upload occurs.",
                    "actual": "Suspected: a duplicate document is created (verify).",
                    "evidence": "Screen recording + duplicate document rows.",
                    "status": DRY_RUN_MARK,
                },
                {
                    "id": "DRY-DOC-UX-002",
                    "title": "Page refresh may lose the active document filter state",
                    "category": "UX Issue",
                    "severity": "Low",
                    "priority": "P3",
                    "role": "office",
                    "preconditions": "A filter applied on the documents list.",
                    "steps": [
                        "Apply a category filter on the documents list.",
                        "Refresh the page.",
                    ],
                    "expected": "Filter persists after refresh.",
                    "actual": "Suspected: filter resets to default (verify).",
                    "evidence": "Before/after screenshots of the list.",
                    "status": DRY_RUN_MARK,
                },
            ],
            "data_integrity_checks": [
                "List reflects newly uploaded documents without a hard refresh.",
            ],
            "rbac_checks": [
                "Filters do not reveal documents the role cannot see.",
            ],
            "regression": [
                "Re-test back/refresh after navigation or form changes.",
                "Re-test filter persistence after list/table changes.",
            ],
            "recommendation": "Go with known issues (after manual verification)",
        },
    }


def _generic_findings(agent_name: str, module: str) -> dict:
    """Schema-compliant dry-run findings for any non-`documents` module."""
    charter = AGENT_CHARTERS.get(agent_name, "Exploratory testing.")
    short = AGENT_DISPLAY_NAMES.get(agent_name, agent_name)
    prefix = "".join(part[0] for part in agent_name.split("_")[:2]).upper() or "AG"
    base = f"DRY-{module.upper()}-{prefix}"
    return {
        "charter": charter,
        "applied_principles": [
            "Risk-Based Testing",
            "Charter-Based Exploratory Testing",
            "Role-Based Testing",
            "Evidence-Based Bug Reporting",
        ],
        "risk_focus": [
            f"Highest-risk {short.lower()} paths in the {module} module.",
        ],
        "test_ideas": [
            {
                "id": f"{base}-TI-001",
                "principle": "Risk-Based Testing",
                "role": "admin",
                "scenario": f"{short} primary flow for {module}.",
                "steps": [
                    f"Open the {module} screen.",
                    f"Exercise the primary {short.lower()} action.",
                ],
                "expected": f"The {short.lower()} behavior is correct and scoped.",
                "evidence": "Screenshot + API response (when run for real).",
            }
        ],
        "bugs": [
            {
                "id": f"{base}-001",
                "title": f"[{short}] sample dry-run candidate for {module}",
                "category": "Test Idea",
                "severity": "Medium",
                "priority": "P2",
                "role": "admin",
                "preconditions": f"A valid {module} record exists.",
                "steps": [
                    f"Open the {module} screen as the relevant role.",
                    f"Perform the {short.lower()} action under test.",
                ],
                "expected": "Behavior matches the business rules.",
                "actual": "Suspected mismatch (dry-run only — verify).",
                "evidence": "Screenshot + API response (when run for real).",
                "status": DRY_RUN_MARK,
            }
        ],
        "data_integrity_checks": [
            f"{short} data stays consistent across list/detail/API for {module}.",
        ],
        "rbac_checks": [
            f"Only authorized roles perform {short.lower()} actions in {module}.",
        ],
        "regression": [
            f"Re-test {short.lower()} flows in {module} after changes.",
        ],
        "recommendation": "Needs manual verification",
    }


def get_dry_run_data(agent_name: str, module: str) -> dict:
    """Return the dry-run findings dict for an agent + module."""
    if module == "documents":
        findings = _documents_findings(module)
        if agent_name in findings:
            return findings[agent_name]
    return _generic_findings(agent_name, module)


def build_dry_run_response(agent_name: str, module: str) -> str:
    """Build a full structured, module-specific dry-run agent report."""
    data = get_dry_run_data(agent_name, module)
    header = (
        "DRY RUN MODE — No OpenAI API call was made. All findings below are "
        f"exploratory and marked `{DRY_RUN_MARK}`.\n\n"
    )
    return header + format_agent_report(agent_name, module, data)


# ---------------------------------------------------------------------------
# Final consolidated dry-run report.
# ---------------------------------------------------------------------------
def _severity_rank(sev: str) -> int:
    order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    return order.get(sev, 4)


def _principle_coverage_table(coverage: dict[str, list[str]]) -> str:
    """Render the 'Testing Principles Applied' table.

    `coverage` maps a principle name to the agent display names that applied it.
    """
    header = "| Principle | Covered? | Where |\n|---|---|---|\n"
    rows = []
    for name in PRINCIPLE_NAMES:
        where = coverage.get(name, [])
        covered = "Yes" if where else "Planned"
        where_text = ", ".join(sorted(set(where))) if where else "Manual follow-up"
        rows.append(f"| {name} | {covered} | {where_text} |")
    return header + "\n".join(rows)


def build_dry_run_final_report(
    module: str, selected_agents: list[str], session_charter: str
) -> str:
    """Build the structured consolidated dry-run report from agent data."""
    candidate_rows: list[dict] = []
    risks: list[str] = []
    test_ideas: list[str] = []
    ux_issues: list[str] = []
    questions: list[str] = []
    checklist: list[str] = []
    regression: list[str] = []
    coverage: dict[str, list[str]] = {}

    for agent in selected_agents:
        data = get_dry_run_data(agent, module)
        display = AGENT_DISPLAY_NAMES.get(agent, agent)

        for principle in data.get("applied_principles", []):
            coverage.setdefault(principle, []).append(display)

        for bug in data.get("bugs", []):
            category = bug.get("category", "Bug Candidate")
            line = f"{bug['id']} — {bug['title']} ({display})"
            if category == "Bug Candidate":
                candidate_rows.append({**bug, "agent": display})
            elif category == "Risk":
                risks.append(line)
                candidate_rows.append({**bug, "agent": display})
            elif category == "UX Issue":
                ux_issues.append(line)
            elif category == "Question":
                questions.append(line)
            else:  # Test Idea
                test_ideas.append(line)

        for idea in data.get("test_ideas", []):
            test_ideas.append(
                f"{idea['id']} — {idea['scenario']} "
                f"[{idea.get('principle', '')}] ({display})"
            )
            checklist.append(f"{display}: {idea['scenario']}")
        regression.extend(data.get("regression", []))

    candidate_rows.sort(key=lambda b: _severity_rank(b.get("severity", "")))

    table_header = (
        "| ID | Severity | Priority | Agent | Title | Status |\n"
        "|---|---|---|---|---|---|\n"
    )
    table_body = "\n".join(
        f"| {b['id']} | {b['severity']} | {b['priority']} | {b['agent']} | "
        f"{b['title']} | {b.get('status', DRY_RUN_MARK)} |"
        for b in candidate_rows
    )
    bug_table = table_header + (table_body or "| (none) |  |  |  |  |  |")

    agents_list = _bullets(
        [AGENT_DISPLAY_NAMES.get(a, a) for a in selected_agents]
    )

    return (
        f"# Exploratory QA Report — {module}\n\n"
        "## Execution Mode\n"
        "DRY RUN (no OpenAI API call was made)\n\n"
        f"## Session Charter\n{session_charter}\n\n"
        "## Testing Principles Applied\n"
        f"{_principle_coverage_table(coverage)}\n\n"
        f"## Selected Agents\n{agents_list}\n\n"
        "## Executive Summary\n"
        f"Dry-run exploratory pass of {len(selected_agents)} agent(s) over the "
        f"`{module}` module produced {len(candidate_rows)} bug candidate(s), "
        f"{len(test_ideas)} test idea(s), and {len(ux_issues)} UX issue(s). "
        "No confirmed bugs are reported in dry-run mode; every item needs manual "
        "verification. Use this report as a structured exploratory testing "
        "plan.\n\n"
        "## Confirmed Bugs\n"
        "- (none — dry-run mode does not confirm bugs without evidence)\n\n"
        f"## Bug Candidates\n{bug_table}\n\n"
        f"## Risks\n{_bullets(risks)}\n\n"
        f"## Test Ideas\n{_bullets(test_ideas)}\n\n"
        f"## UX Issues\n{_bullets(ux_issues)}\n\n"
        f"## Questions / Requirement Gaps\n{_bullets(questions)}\n\n"
        f"## Manual Exploratory Test Checklist\n{_bullets(checklist)}\n\n"
        f"## Regression Checklist\n{_bullets(regression)}\n\n"
        "## Final Recommendation\n"
        "Not applicable — dry-run only. Use this report as a structured "
        "exploratory testing plan."
    )
