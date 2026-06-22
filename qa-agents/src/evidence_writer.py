"""Phase 7B: render the Playwright evidence report.

Turns the structured Playwright result (from ``playwright_runner``) plus the
current problem inventory into a markdown evidence report. The core rule of this
phase is encoded here: **no problem becomes a Confirmed Bug without explicit
evidence.** Passing tests simply mean a risk was not reproduced; failing tests
become "Evidence Found - Needs Triage" only when they map clearly to a candidate.

Output file (written under ``qa-agents/``):
    reports/evidence_report.md
"""

from __future__ import annotations

import json
import os

# qa-agents/ root (parent of src/).
_ROOT = os.path.dirname(os.path.dirname(__file__))

NEEDS_MANUAL = "Needs Manual Verification"
EVIDENCE_TRIAGE = "Evidence Found - Needs Triage"

# Phase 7C statuses for the problem-inventory mapping.
DRY_RUN_MANUAL = "DRY RUN - NEEDS MANUAL VERIFICATION"
NOT_REPRODUCED = "Not Reproduced in Current E2E Coverage"

# Keywords that mark a skipped test as a high-risk (security/RBAC) scenario.
_HIGH_RISK_KEYWORDS = (
    "rbac",
    "admin",
    "driver",
    "office",
    "private",
    "tenant",
    "direct-id",
    "unauthorized",
    "authenticate",
    "document",
)


def _high_risk_skipped(skipped_titles: list[str]) -> list[str]:
    """Return skipped test titles that look like high-risk security/RBAC checks."""
    result: list[str] = []
    for title in skipped_titles:
        lowered = title.lower()
        if any(keyword in lowered for keyword in _HIGH_RISK_KEYWORDS):
            result.append(title)
    return result


def _next_executable_steps(skipped_titles: list[str], executed: bool) -> list[str]:
    """Suggest the next skipped checks to unblock, easiest/highest-value first."""
    if not executed:
        return ["Start the Fleet app and re-run with --execute-e2e."]

    steps: list[str] = []
    lowered = [t.lower() for t in skipped_titles]

    # Credential-gated role checks are the cheapest to unblock (just add creds).
    if any("driver role should not access the admin" in t for t in lowered):
        steps.append(
            "Add DRIVER_* credentials to e2e/.env.e2e to run the driver→admin "
            "documents denial test."
        )
    if any("office role should not access the driver portal" in t for t in lowered):
        steps.append(
            "Add OFFICE_* credentials to e2e/.env.e2e to run the office→driver "
            "portal denial test."
        )
    if any("private driver" in t for t in lowered):
        steps.append(
            "Expose a stable selector (e.g. data-testid=\"document-row-private\") "
            "and seed a private document to run the private-document visibility test."
        )
    if any("direct-id" in t for t in lowered):
        steps.append(
            "Seed a known document id (and a detail route or documented API) to "
            "run the direct-ID unauthorized-access test."
        )
    if any("tenant_b" in t or "tenant_a" in t for t in lowered):
        steps.append(
            "Seed a tenant_b document id to run the cross-tenant isolation test."
        )

    if not steps:
        steps.append("No further executable tests are currently blocked.")
    return steps


def _problem_status(
    module: str,
    failed_titles: list[str],
    passed_titles: list[str],
    executed: bool,
) -> str:
    """Map a problem candidate to one of the three Phase 7C statuses.

    - A failed test that references the module -> Evidence Found - Needs Triage.
    - Otherwise a passed test that references the module -> Not Reproduced.
    - Otherwise (only skipped / no executing coverage) -> DRY RUN manual.

    Nothing is ever auto-marked Confirmed Bug; promotion requires explicit,
    human-triaged evidence.
    """
    module = (module or "").lower()
    if not executed or not module:
        return DRY_RUN_MANUAL
    if any(module in t.lower() for t in failed_titles):
        return EVIDENCE_TRIAGE
    if any(module in t.lower() for t in passed_titles):
        return NOT_REPRODUCED
    return DRY_RUN_MANUAL



def _write(rel_dir: str, filename: str, content: str) -> str:
    """Write content under qa-agents/<rel_dir>/<filename> and return the path."""
    target_dir = os.path.join(_ROOT, rel_dir)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return path


def _collect_test_titles(report: dict) -> tuple[list[str], list[str], list[str]]:
    """Walk a Playwright JSON report and return (failed, skipped, passed) titles."""
    failed: list[str] = []
    skipped: list[str] = []
    passed: list[str] = []

    def title_for(suite_title: str, spec_title: str) -> str:
        parts = [p for p in (suite_title, spec_title) if p]
        return " > ".join(parts) if parts else (spec_title or "(untitled test)")

    def walk_suite(suite: dict, prefix: str) -> None:
        suite_title = suite.get("title", "") or ""
        combined = " > ".join([p for p in (prefix, suite_title) if p])
        for spec in suite.get("specs", []) or []:
            spec_title = spec.get("title", "") or ""
            for test in spec.get("tests", []) or []:
                status = test.get("status")
                results = test.get("results", []) or []
                last = results[-1] if results else {}
                outcome = status or last.get("status")
                label = title_for(combined, spec_title)
                if outcome in ("unexpected", "failed", "timedOut", "interrupted"):
                    failed.append(label)
                elif outcome == "skipped":
                    skipped.append(label)
                elif outcome in ("expected", "passed", "flaky"):
                    passed.append(label)
        for child in suite.get("suites", []) or []:
            walk_suite(child, combined)

    for suite in report.get("suites", []) or []:
        walk_suite(suite, "")

    return failed, skipped, passed



def _load_raw_report(playwright_results: dict) -> dict:
    """Best-effort load of the raw Playwright JSON report from disk."""
    raw_path = playwright_results.get("raw_results_path")
    if not raw_path or not os.path.isfile(raw_path):
        return {}
    try:
        with open(raw_path, "r", encoding="utf-8") as handle:
            text = handle.read()
        return json.loads(text) if text.strip() else {}
    except (OSError, json.JSONDecodeError, ValueError):
        return {}


def _problem_label(problem: dict) -> str:
    """Build a short human label for a problem-inventory entry."""
    pid = problem.get("id") or problem.get("ref") or ""
    module = problem.get("module", "")
    title = (
        problem.get("scenario")
        or problem.get("title")
        or problem.get("description")
        or ""
    )
    bits = [b for b in (pid, module) if b]
    head = " ".join(bits)
    return f"{head}: {title}".strip(": ").strip() if (head or title) else "(unnamed problem)"


def render_evidence_report(
    playwright_results: dict, problem_inventory: list[dict]
) -> str:
    """Render the evidence report markdown (pure; no disk writes)."""
    executed = bool(playwright_results.get("executed"))
    exit_code = playwright_results.get("exit_code")
    passed = playwright_results.get("passed", 0)
    failed = playwright_results.get("failed", 0)
    skipped = playwright_results.get("skipped", 0)
    run_error = playwright_results.get("error")
    blocked_reason = playwright_results.get("reason")

    report = _load_raw_report(playwright_results)
    failed_titles, skipped_titles, passed_titles = _collect_test_titles(report)

    lines: list[str] = []
    lines.append("# Evidence Report")
    lines.append("")
    lines.append(
        "Generated by the Fleet QA Playwright evidence harness (Phase 7C). "
        "No problem is promoted to a Confirmed Bug without explicit evidence."
    )
    lines.append("")

    # Execution Summary -----------------------------------------------------
    lines.append("## Execution Summary")
    lines.append("")
    lines.append(f"- Executed: {executed}")
    lines.append(f"- Exit code: {exit_code if executed else 'n/a'}")
    lines.append(f"- Passed: {passed if executed else 'n/a'}")
    lines.append(f"- Failed: {failed if executed else 'n/a'}")
    lines.append(f"- Skipped: {skipped if executed else 'n/a'}")
    if not executed:
        lines.append("")
        lines.append(f"- Status: BLOCKED — {blocked_reason or 'Playwright did not run'}")
        if run_error:
            lines.append(f"- Error: {run_error}")
    lines.append("")

    # Coverage Interpretation (Phase 7C) ------------------------------------
    total = (passed or 0) + (failed or 0) + (skipped or 0)
    executed_count = (passed or 0) + (failed or 0)
    coverage_pct = (executed_count / total * 100) if total else 0.0
    high_risk = _high_risk_skipped(skipped_titles)

    lines.append("## Coverage Interpretation")
    lines.append("")
    lines.append(f"- Passed: {passed if executed else 0}")
    lines.append(f"- Failed: {failed if executed else 0}")
    lines.append(f"- Skipped: {skipped if executed else 0}")
    lines.append(
        f"- Executable coverage percentage: {coverage_pct:.1f}% "
        f"({executed_count} of {total} defined tests actually executed)"
    )
    lines.append("- High-risk scenarios still skipped:")
    if not executed:
        lines.append("  - _Playwright did not run; coverage is unknown._")
    elif high_risk:
        for title in high_risk:
            lines.append(f"  - {title}")
    else:
        lines.append("  - _None detected._")
    lines.append("- Next executable tests to implement:")
    next_steps = _next_executable_steps(skipped_titles, executed)
    for step in next_steps:
        lines.append(f"  - {step}")
    lines.append("")

    # Raw Evidence Files ----------------------------------------------------
    lines.append("## Raw Evidence Files")
    lines.append("")
    lines.append("- evidence/playwright_results.json")
    lines.append("- evidence/playwright_stderr.log")
    lines.append("")


    # Interpretation Rules --------------------------------------------------
    lines.append("## Interpretation Rules")
    lines.append("")
    lines.append(
        "- Passed Playwright test means the related risk was not reproduced in "
        "that test."
    )
    lines.append(
        "- Failed Playwright test means a possible confirmed issue, but it must "
        "be triaged."
    )
    lines.append("- Skipped test means it was not executed.")
    lines.append("- No confirmed bug without evidence.")
    lines.append("")

    # Failed Tests ----------------------------------------------------------
    lines.append("## Failed Tests")
    lines.append("")
    if not executed:
        lines.append("_Playwright did not run, so no failed tests were recorded._")
    elif failed_titles:
        for title in failed_titles:
            lines.append(f"- {title}")
    else:
        lines.append("_No failed tests._")
    lines.append("")

    # Skipped Tests ---------------------------------------------------------
    lines.append("## Skipped Tests")
    lines.append("")
    if not executed:
        lines.append("_Playwright did not run, so no skipped tests were recorded._")
    elif skipped_titles:
        for title in skipped_titles:
            lines.append(f"- {title}")
    else:
        lines.append("_No skipped tests._")
    lines.append("")

    # Problem Inventory Impact ---------------------------------------------
    lines.append("## Problem Inventory Impact")
    lines.append("")
    if not problem_inventory:
        lines.append(
            "_No problem inventory candidates were supplied. All findings remain "
            f"'{DRY_RUN_MANUAL}'._"
        )
    else:
        lines.append(
            "Status mapping (no candidate is auto-marked Confirmed Bug):"
        )
        lines.append(
            f"- Only skipped / no executing coverage -> '{DRY_RUN_MANUAL}'."
        )
        lines.append(
            f"- A passed test references the module -> '{NOT_REPRODUCED}'."
        )
        lines.append(
            f"- A failed test references the module -> '{EVIDENCE_TRIAGE}' "
            "(requires human triage)."
        )
        lines.append("")
        for problem in problem_inventory:
            label = _problem_label(problem)
            module = problem.get("module") or ""
            status = _problem_status(module, failed_titles, passed_titles, executed)
            lines.append(f"- {label} — status: {status}")
    lines.append("")

    return "\n".join(lines)


def _render_problem_inventory(
    playwright_results: dict, problem_inventory: list[dict]
) -> str:
    """Render a standalone problem inventory with Phase 7C statuses."""
    executed = bool(playwright_results.get("executed"))
    report = _load_raw_report(playwright_results)
    failed_titles, _skipped_titles, passed_titles = _collect_test_titles(report)

    lines: list[str] = []
    lines.append("# Problem Inventory (Phase 7C)")
    lines.append("")
    lines.append(
        "Each candidate's status is derived from live Playwright evidence. "
        "Nothing is auto-marked Confirmed Bug — promotion requires explicit, "
        "human-triaged evidence."
    )
    lines.append("")
    lines.append("## Status legend")
    lines.append("")
    lines.append(f"- `{DRY_RUN_MANUAL}` — only skipped / no executing coverage.")
    lines.append(f"- `{NOT_REPRODUCED}` — a passed test exercised the module.")
    lines.append(f"- `{EVIDENCE_TRIAGE}` — a failed test maps to the module.")
    lines.append("")
    lines.append("## Candidates")
    lines.append("")
    if not problem_inventory:
        lines.append("_No problem inventory candidates were supplied._")
    else:
        for problem in problem_inventory:
            label = _problem_label(problem)
            module = problem.get("module") or ""
            status = _problem_status(module, failed_titles, passed_titles, executed)
            lines.append(f"- {label} — status: {status}")
    lines.append("")
    return "\n".join(lines)


def write_evidence_report(
    playwright_results: dict, problem_inventory: list[dict]
) -> str:
    """Render and write the evidence report; return its path.

    Also writes the companion ``reports/problem_inventory.md`` so the per-
    candidate Phase 7C statuses are available as a standalone artifact.
    """
    inventory = problem_inventory or []
    content = render_evidence_report(playwright_results, inventory)
    evidence_path = _write("reports", "evidence_report.md", content)

    inventory_content = _render_problem_inventory(playwright_results, inventory)
    _write("reports", "problem_inventory.md", inventory_content)

    return evidence_path
