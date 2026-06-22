"""Manual exploratory session generator.

Turns the structured exploratory findings (from `qa_schema`) into a practical,
browser-executable manual test session sheet that follows the layout in
`templates/exploratory_session_template.md`.

This is deterministic and **never calls OpenAI** — it reads the same structured
test ideas / bug candidates the agents use and renders them as numbered test
cases (TC-<MODULE>-NNN) with empty Actual Result / Status = Not Run, ready to be
filled in while testing the Fleet app in the browser.
"""

from __future__ import annotations

import os

from qa_schema import (
    AGENT_DISPLAY_NAMES,
    get_dry_run_data,
)

# Static principles list shown in every session sheet (matches the template).
_SESSION_PRINCIPLES = [
    "Risk-Based Testing",
    "Charter-Based Exploratory Testing",
    "Role-Based Testing",
    "Boundary and Edge Case Testing",
    "Data Integrity",
    "Cross-Module Effects",
    "Evidence-Based Bug Reporting",
    "Regression Thinking",
]


def _collect_test_cases(module: str, selected_agents: list[str]) -> list[dict]:
    """Build an ordered list of test-case dicts from the structured findings.

    Each agent's exploratory test ideas become manual test cases. This keeps the
    session sheet in sync with what the agents actually explore.
    """
    cases: list[dict] = []
    for agent in selected_agents:
        data = get_dry_run_data(agent, module)
        category = AGENT_DISPLAY_NAMES.get(agent, agent)
        for idea in data.get("test_ideas", []):
            cases.append(
                {
                    "category": category,
                    "principle": idea.get("principle", ""),
                    "role": idea.get("role", ""),
                    "scenario": idea.get("scenario", ""),
                    "steps": idea.get("steps", []),
                    "expected": idea.get("expected", ""),
                    "evidence": idea.get("evidence", ""),
                }
            )
    return cases


def _format_test_case(module_tag: str, index: int, case: dict) -> str:
    """Render a single numbered manual test case in the template format."""
    tc_id = f"TC-{module_tag}-{index:03d}"
    steps = case.get("steps", [])
    steps_md = "\n".join(f"{i}. {s}  " for i, s in enumerate(steps, start=1))
    title = case.get("scenario", "").rstrip(".")
    return (
        f"### {tc_id} — {title}\n\n"
        f"**Category:** {case.get('category', '')}  \n"
        f"**Principle:** {case.get('principle', '')}  \n"
        f"**Role:** {case.get('role', '')}  \n"
        f"**Preconditions:**  \n"
        f"**Steps:**  \n{steps_md}\n\n"
        f"**Expected Result:** {case.get('expected', '')}  \n"
        f"**Actual Result:**  \n"
        f"**Status:** Not Run  \n"
        f"**Evidence:** {case.get('evidence', '')}  \n"
        f"**Bug ID:**  \n"
        f"**Notes:**  "
    )


def build_manual_session(
    module: str, selected_agents: list[str], session_charter: str
) -> str:
    """Build the full manual exploratory session markdown for a module."""
    module_tag = module.upper()[:3] if module else "MOD"
    cases = _collect_test_cases(module, selected_agents)
    cases_md = "\n\n".join(
        _format_test_case(module_tag, i, c) for i, c in enumerate(cases, start=1)
    )
    principles_md = "\n".join(f"- {p}" for p in _SESSION_PRINCIPLES)
    charter = session_charter or (
        f"Explore the `{module}` module to surface the highest-risk defects."
    )

    return (
        f"# Manual Exploratory Test Session — {module}\n\n"
        "## Session Info\n"
        f"- Module: {module}\n"
        "- Date: ______________________\n"
        "- Tester: ______________________\n"
        "- Environment: local dev (backend :3000, frontend :3001)\n"
        "- App URL: http://localhost:3001\n"
        "- Browser: ______________________\n"
        "- Test Data: prepare the records needed by the preconditions below "
        "(drivers/vehicles/companies, documents, expiries, two tenants)\n"
        "- Roles Tested: admin, boss, accounting, office, driver\n"
        "- Timebox: 60–90 minutes\n\n"
        "## Session Charter\n"
        f"{charter}\n\n"
        "## Testing Principles Applied\n"
        f"{principles_md}\n\n"
        "## Test Cases\n\n"
        f"{cases_md or '_(no test cases generated)_'}\n\n"
        "## Bugs Found\n"
        "- (none yet — log confirmed failures in `bugs/bug_log.md` using "
        "`templates/bug_report_template.md`)\n\n"
        "## Questions / Requirement Gaps\n"
        "- ...\n\n"
        "## Regression Notes\n"
        "- Re-test affected flows after any related code change.\n"
        "- Re-check cross-module side effects (dashboard, reminders, calendar, "
        "export) impacted by this module.\n\n"
        "## Session Summary\n"
        "- Passed:\n"
        "- Failed:\n"
        "- Blocked:\n"
        "- Bugs created:\n"
        "- Follow-up needed:\n"
    )


def write_session(module: str, content: str) -> str:
    """Write the manual session sheet to qa-agents/sessions/ and return its path."""
    sessions_dir = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "sessions"
    )
    os.makedirs(sessions_dir, exist_ok=True)
    path = os.path.join(sessions_dir, f"{module}_manual_session.md")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return path
