"""Writers for the Phase 6A full-system QA foundation outputs.

Renders the test roles, the test matrix, and the consolidated full-system report
to markdown and saves them under the qa-agents output folders (creating folders
as needed). All deterministic; no OpenAI calls; no confirmed bugs are produced.

Output files:
    roles/test_roles.md
    matrix/fleet_test_matrix.md
    reports/full_system_qa_report.md
"""

from __future__ import annotations

import os
from datetime import datetime

# qa-agents/ root (parent of src/).
_ROOT = os.path.dirname(os.path.dirname(__file__))

DRY_RUN_MARK = "DRY RUN - NEEDS MANUAL VERIFICATION"


def _write(rel_dir: str, filename: str, content: str) -> str:
    """Write content under qa-agents/<rel_dir>/<filename> and return the path."""
    target_dir = os.path.join(_ROOT, rel_dir)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return path


# ---------------------------------------------------------------------------
# Renderers
# ---------------------------------------------------------------------------
def render_test_roles(test_roles: list[dict]) -> str:
    """Render the test role/persona definitions to markdown."""
    lines = [
        "# Fleet Test Roles (Personas)",
        "",
        "These are the **test roles** we log in as while testing — distinct from",
        "the QA **agent roles** (the testing specialists). Each persona maps to a",
        "Fleet app role within a tenant, with explicit allowed/forbidden actions.",
        "tenant_b roles are used mainly for cross-tenant / direct-ID access tests.",
        "",
        "| Role ID | App Role | Tenant | Risk Focus |",
        "| --- | --- | --- | --- |",
    ]
    for role in test_roles:
        lines.append(
            f"| {role['role_id']} | {role['app_role']} | {role['tenant']} | "
            f"{', '.join(role['risk_focus'])} |"
        )
    lines.append("")
    for role in test_roles:
        lines.append(f"## {role['role_id']}")
        lines.append("")
        lines.append(f"- **App role:** {role['app_role']}")
        lines.append(f"- **Tenant:** {role['tenant']}")
        lines.append(f"- **Description:** {role['description']}")
        lines.append("- **Allowed actions:**")
        for action in role["allowed_actions"]:
            lines.append(f"  - {action}")
        lines.append("- **Forbidden actions:**")
        for action in role["forbidden_actions"]:
            lines.append(f"  - {action}")
        lines.append("- **Risk focus:**")
        for focus in role["risk_focus"]:
            lines.append(f"  - {focus}")
        lines.append("")
    return "\n".join(lines)


def render_test_matrix(test_matrix: list[dict]) -> str:
    """Render the full-system test matrix to markdown."""
    lines = [
        "# Fleet Full-System Test Matrix",
        "",
        f"_{DRY_RUN_MARK}_",
        "",
        f"Total scenarios: **{len(test_matrix)}**",
        "",
        "| ID | Module | Risk | Principle | Category | Role | Agent | Scenario | Expected Result |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for item in test_matrix:
        lines.append(
            f"| {item['id']} | {item['module']} | {item['risk_level']} | "
            f"{item['principle']} | {item['category']} | {item['role']} | "
            f"{item['suggested_agent_type']} | {item['scenario']} | "
            f"{item['expected_result']} |"
        )
    lines.append("")
    lines.append("## Evidence Required Per Scenario")
    lines.append("")
    for item in test_matrix:
        lines.append(
            f"- **{item['id']}** ({item['module']}): "
            f"{', '.join(item['evidence_needed'])}"
        )
    lines.append("")
    return "\n".join(lines)


def render_full_system_report(state: dict) -> str:
    """Render the consolidated full-system foundation report."""
    discovered = state.get("discovered_modules", [])
    roles = state.get("test_roles", [])
    matrix = state.get("test_matrix", [])

    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = [
        "# Fleet Full-System QA Report",
        "",
        f"_Generated: {timestamp}_",
        "",
        f"_{DRY_RUN_MARK}_",
        "",
        "This foundation report is produced by the full-system QA orchestrator.",
        "It **discovers modules**, **creates test roles**, and **builds a",
        "full-system test matrix**. It does **not** confirm bugs and does **not**",
        "call OpenAI in dry-run/foundation mode — every scenario is a test idea",
        "that needs manual verification with evidence.",
        "",
        "## Coverage at a Glance",
        "",
        f"- Modules discovered: **{len(discovered)}**",
        f"- Test roles (personas): **{len(roles)}**",
        f"- Test matrix scenarios: **{len(matrix)}**",
        "",
        "## Discovered Modules",
        "",
        "| Module | Risk Level | Files Found | Risk Reason |",
        "| --- | --- | --- | --- |",
    ]
    for entry in discovered:
        lines.append(
            f"| {entry['module']} | {entry['risk_level']} | "
            f"{entry['file_count']} | {entry['risk_reason']} |"
        )
    lines.append("")

    lines.append("## Test Roles")
    lines.append("")
    lines.append("| Role ID | App Role | Tenant |")
    lines.append("| --- | --- | --- |")
    for role in roles:
        lines.append(
            f"| {role['role_id']} | {role['app_role']} | {role['tenant']} |"
        )
    lines.append("")
    lines.append(
        "Full persona details: [roles/test_roles.md](../roles/test_roles.md)"
    )
    lines.append("")

    lines.append("## Test Matrix Summary")
    lines.append("")
    # Count scenarios per module.
    per_module: dict[str, int] = {}
    for item in matrix:
        per_module[item["module"]] = per_module.get(item["module"], 0) + 1
    lines.append("| Module | Scenarios |")
    lines.append("| --- | --- |")
    for entry in discovered:
        lines.append(f"| {entry['module']} | {per_module.get(entry['module'], 0)} |")
    lines.append("")
    lines.append(
        "Full matrix: [matrix/fleet_test_matrix.md](../matrix/fleet_test_matrix.md)"
    )
    lines.append("")

    lines.append("## Next Steps")
    lines.append("")
    lines.append(
        "1. Execute the matrix scenarios manually, starting with Critical/High "
        "risk modules (auth, user_management, documents, einsatzplan)."
    )
    lines.append(
        "2. Capture the listed evidence for each scenario before recording a "
        "result."
    )
    lines.append(
        "3. Only after a human reproduces an issue with evidence should it be "
        "promoted from a test idea to a confirmed bug."
    )
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Save helpers
# ---------------------------------------------------------------------------
def write_test_roles(test_roles: list[dict]) -> str:
    """Render and save the test roles; return the file path."""
    return _write("roles", "test_roles.md", render_test_roles(test_roles))


def write_test_matrix(test_matrix: list[dict]) -> str:
    """Render and save the test matrix; return the file path."""
    return _write("matrix", "fleet_test_matrix.md", render_test_matrix(test_matrix))


def write_full_system_report(state: dict) -> str:
    """Render and save the full-system report; return the file path."""
    return _write(
        "reports", "full_system_qa_report.md", render_full_system_report(state)
    )
