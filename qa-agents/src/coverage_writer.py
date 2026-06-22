"""Phase 7D: render and write the scenario coverage report."""

from __future__ import annotations

import os

from scenario_coverage import summarize_playwright_results

_ROOT = os.path.dirname(os.path.dirname(__file__))


def _write(rel_dir: str, filename: str, content: str) -> str:
    target_dir = os.path.join(_ROOT, rel_dir)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return path


def _count(items: list[dict], *, status: str | None = None, automated_only: bool = False) -> int:
    total = 0
    for item in items:
        if status and item.get("execution_status") != status:
            continue
        if automated_only and not item.get("mapped_test"):
            continue
        total += 1
    return total


def _manual_needed_count(items: list[dict]) -> int:
    return sum(
        1
        for item in items
        if item.get("execution_status") == "manual_needed"
        or (
            item.get("execution_type") == "not_mapped"
            and item.get("execution_status") == "not_run"
        )
    )


def _coverage_rows(items: list[dict], key: str) -> list[tuple[str, list[dict]]]:
    groups: dict[str, list[dict]] = {}
    for item in items:
        label = item.get(key, "") or "(unknown)"
        groups.setdefault(label, []).append(item)
    return sorted(groups.items(), key=lambda pair: pair[0].lower())


def _priority_candidates(items: list[dict], phrases: list[str]) -> list[dict]:
    lowered_phrases = [phrase.lower() for phrase in phrases]
    matches = []
    for item in items:
        haystack = f"{item.get('module', '')} {item.get('scenario', '')}".lower()
        if any(phrase in haystack for phrase in lowered_phrases):
            matches.append(item)
    return matches


def _mapped_scenarios_count(items: list[dict]) -> int:
    return sum(1 for item in items if item.get("mapped_test"))


def render_scenario_coverage_report(
    scenario_coverage: list[dict], playwright_results: dict
) -> str:
    """Render the scenario coverage report markdown."""
    pw = summarize_playwright_results(playwright_results)
    total = len(scenario_coverage)
    automated_tests = pw["automated"]
    passed_tests = pw["passed"]
    failed_tests = pw["failed"]
    skipped_tests = pw["skipped"]
    mapped_scenarios = _mapped_scenarios_count(scenario_coverage)

    not_mapped = sum(1 for item in scenario_coverage if item.get("execution_type") == "not_mapped")
    manual_needed = _manual_needed_count(scenario_coverage)
    blocked = _count(scenario_coverage, status="blocked")

    lines = [
        "# Scenario Coverage Report",
        "",
        "This report separates the **generated exploratory matrix** from the",
        "**actual Playwright execution evidence**. The matrix is a plan; only",
        "explicitly mapped Playwright tests count as automated execution.",
        "Mappings are defined in `matrix/scenario_mapping.json`; the raw JSON is",
        "kept there and not embedded into this markdown report.",
        "",
        "## Summary",
        "",
        f"- Total scenarios: {total}",
        f"- Automated Playwright tests: {automated_tests}",
        f"- Mapped matrix scenarios: {mapped_scenarios}",
        f"- Passed: {passed_tests}",
        f"- Failed: {failed_tests}",
        f"- Skipped: {skipped_tests}",
        f"- Not mapped: {not_mapped}",
        f"- Manual needed: {manual_needed}",
        f"- Blocked: {blocked}",
        "",
        "## Coverage by Risk",
        "",
        "| Risk | Total | Automated | Passed | Failed | Skipped | Not Run | Blocked |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    for risk, rows in _coverage_rows(scenario_coverage, "risk_level"):
        automated = sum(1 for row in rows if row.get("mapped_test"))
        passed = _count(rows, status="passed")
        failed = _count(rows, status="failed")
        skipped = _count(rows, status="skipped")
        not_run = _count(rows, status="not_run") + _count(rows, status="manual_needed")
        blocked_rows = _count(rows, status="blocked")
        lines.append(
            f"| {risk} | {len(rows)} | {automated} | {passed} | {failed} | {skipped} | {not_run} | {blocked_rows} |"
        )

    lines.extend(
        [
            "",
            "## Coverage by Module",
            "",
            "| Module | Total | Automated | Passed | Failed | Skipped | Not Run | Blocked |",
            "| --- | --- | --- | --- | --- | --- | --- | --- |",
        ]
    )

    for module, rows in _coverage_rows(scenario_coverage, "module"):
        automated = sum(1 for row in rows if row.get("mapped_test"))
        passed = _count(rows, status="passed")
        failed = _count(rows, status="failed")
        skipped = _count(rows, status="skipped")
        not_run = _count(rows, status="not_run") + _count(rows, status="manual_needed")
        blocked_rows = _count(rows, status="blocked")
        lines.append(
            f"| {module} | {len(rows)} | {automated} | {passed} | {failed} | {skipped} | {not_run} | {blocked_rows} |"
        )

    lines.extend(["", "## High-Risk Not Yet Executed", ""])
    high_risk = [
        item
        for item in scenario_coverage
        if (item.get("risk_level") in ("Critical", "High"))
        and item.get("execution_status") not in ("passed", "failed")
    ]
    if high_risk:
        for item in high_risk:
            lines.append(
                f"- **{item.get('scenario_id')}** [{item.get('module')}] "
                f"{item.get('scenario')} — status: {item.get('execution_status')}"
            )
            lines.append(f"  Next action: {item.get('next_action')}")
    else:
        lines.append("_No Critical/High scenarios remain unexecuted._")

    lines.extend(["", "## Skipped Playwright Tests", ""])
    skipped_entries = [test for test in pw["tests"] if test.get("status") == "skipped"]
    if skipped_entries:
        for test in skipped_entries:
            reason = test.get("skip_reason") or "No explicit skip reason was recorded."
            lines.append(f"- **{test.get('title')}**")
            lines.append(f"  - File: {test.get('file')}")
            lines.append(f"  - Reason: {reason}")
    else:
        lines.append("_No Playwright tests were skipped._")

    lines.extend(["", "## Next Automation Candidates", ""])
    priorities = [
        ("1. Critical RBAC", ["driver attempts to open the admin dashboard", "office attempts to open a finance route", "private driver salary/medical", "driver role should not access the admin documents page"]),
        ("2. Cross-tenant access", ["another tenant's document", "tenant_b document"]),
        ("3. Document owner binding", ["owner-type mismatch between a document and its owner"]),
        ("4. Reminder generation", ["expired document should drive a compliance reminder"]),
        ("5. Assignment/calendar conflict", ["leave day conflicts with an assignment", "assignment update should update the calendar"]),
        ("6. Export finance visibility", ["office role should not export finance data"]),
    ]
    for heading, phrases in priorities:
        lines.append(f"{heading}")
        candidates = _priority_candidates(scenario_coverage, phrases)
        if candidates:
            for item in candidates[:3]:
                lines.append(
                    f"- {item.get('scenario_id')} [{item.get('module')}] — "
                    f"{item.get('execution_status')}: {item.get('next_action')}"
                )
        else:
            lines.append("- No matching matrix scenario found.")

    lines.append("")
    return "\n".join(lines)


def write_scenario_coverage_report(
    scenario_coverage: list[dict], playwright_results: dict
) -> str:
    """Render and write reports/scenario_coverage_report.md."""
    content = render_scenario_coverage_report(scenario_coverage, playwright_results)
    return _write("reports", "scenario_coverage_report.md", content)