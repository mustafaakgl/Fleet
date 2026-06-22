"""Phase 8B: render and write scenario execution queue reports."""

from __future__ import annotations

import os

from queue_consistency import validate_execution_queue

_ROOT = os.path.dirname(os.path.dirname(__file__))


def _write(rel_dir: str, filename: str, content: str) -> str:
    target_dir = os.path.join(_ROOT, rel_dir)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return path


def _sorted(items: list[dict]) -> list[dict]:
    return sorted(
        items,
        key=lambda item: (
            item.get("priority_order", 99),
            item.get("scenario_id", ""),
        ),
    )


def _priority_matches(items: list[dict], phrases: list[str]) -> list[dict]:
    lowered_phrases = [phrase.lower() for phrase in phrases]
    matches: list[dict] = []
    for item in items:
        haystack = f"{item.get('module', '')} {item.get('scenario', '')}".lower()
        if any(phrase in haystack for phrase in lowered_phrases):
            matches.append(item)
    return _sorted(matches)


def _module_groups(items: list[dict]) -> list[tuple[str, list[dict]]]:
    groups: dict[str, list[dict]] = {}
    for item in items:
        groups.setdefault(item.get("module", "(unknown)"), []).append(item)
    return sorted(groups.items(), key=lambda pair: pair[0].lower())


def render_queue_consistency_check(consistency: dict) -> str:
    lines = [
        "# Queue Consistency Check",
        "",
        f"- Total queue rows: {consistency.get('total', 0)}",
        f"- automated_playwright: {consistency.get('automated_playwright', 0)}",
        f"- automation_candidate: {consistency.get('automation_candidate', 0)}",
        f"- manual_exploratory: {consistency.get('manual_exploratory', 0)}",
        f"- blocked: {consistency.get('blocked', 0)}",
        f"- not_ready: {consistency.get('not_ready', 0)}",
        f"- passed: {consistency.get('passed', 0)}",
        f"- failed: {consistency.get('failed', 0)}",
        f"- skipped: {consistency.get('skipped', 0)}",
        f"- valid: {'yes' if not consistency.get('errors') else 'no'}",
        "",
        "## Errors",
        "",
    ]

    errors = consistency.get("errors", []) or []
    if errors:
        for error in errors:
            lines.append(f"- {error}")
    else:
        lines.append("- None")

    lines.append("")
    return "\n".join(lines)


def render_scenario_execution_queue(queue: list[dict], consistency: dict) -> str:
    blocked_high = [
        item for item in queue
        if item.get("execution_mode") == "blocked"
        and item.get("risk_level") in ("Critical", "High")
    ]
    automation_high = [
        item for item in queue
        if item.get("execution_mode") == "automation_candidate"
        and item.get("risk_level") in ("Critical", "High")
    ]
    manual_items = [item for item in queue if item.get("execution_mode") == "manual_exploratory"]
    executed_items = [
        item for item in queue
        if item.get("execution_mode") == "automated_playwright"
        and item.get("execution_status") in ("passed", "failed")
    ]

    lines = [
        "# Scenario Execution Queue",
        "",
        "This queue is the honest bridge between the generated exploratory matrix",
        "and the smaller subset that was actually executed in Playwright. It does",
        "not claim that unmapped scenarios were run.",
        "",
        "## Summary",
        "",
        f"- Total scenarios: {consistency.get('total', 0)}",
        f"- Automated Playwright: {consistency.get('automated_playwright', 0)}",
        f"- Passed: {consistency.get('passed', 0)}",
        f"- Failed: {consistency.get('failed', 0)}",
        f"- Skipped: {consistency.get('skipped', 0)}",
        f"- Automation candidates: {consistency.get('automation_candidate', 0)}",
        f"- Manual exploratory: {consistency.get('manual_exploratory', 0)}",
        f"- Blocked: {consistency.get('blocked', 0)}",
        f"- Not ready: {consistency.get('not_ready', 0)}",
        "",
        "## Queue Consistency",
        "",
        f"- Valid: {'yes' if not consistency.get('errors') else 'no'}",
        "- Errors:",
    ]

    errors = consistency.get("errors", []) or []
    if errors:
        for error in errors:
            lines.append(f"  - {error}")
    else:
        lines.append("  - None")

    lines.extend(
        [
            "",
            "## Explanation of Counts",
            "",
            "- Playwright test count is test-based and comes from the raw Playwright report.",
            "- Scenario queue count is matrix-scenario-based and comes only from execution_queue rows.",
            "- Passed/failed/skipped in this queue are scenario-based, not raw Playwright test-count-based.",
            "",
            "## Priority 1 — Critical/High Blocked",
            "",
        ]
    )

    if blocked_high:
        for item in _sorted(blocked_high):
            lines.append(f"- **{item.get('scenario_id')}** [{item.get('module')}] {item.get('scenario')}")
            lines.append(f"  - Role: {item.get('role')}")
            lines.append(f"  - Blockers: {', '.join(blocker.get('type', '') for blocker in item.get('blockers', []))}")
            lines.append(f"  - Next action: {item.get('next_action')}")
    else:
        lines.append("_No Critical/High scenarios are currently classified as blocked._")

    lines.extend(["", "## Priority 2 — Critical/High Automation Candidates", ""])
    if automation_high:
        for item in _sorted(automation_high):
            lines.append(f"- **{item.get('scenario_id')}** [{item.get('module')}] {item.get('scenario')}")
            lines.append(f"  - Role: {item.get('role')}")
            lines.append(f"  - Next action: {item.get('next_action')}")
    else:
        lines.append("_No Critical/High automation candidates remain._")

    lines.extend(["", "## Priority 3 — Manual Exploratory Queue", ""])
    if manual_items:
        for item in _sorted(manual_items):
            lines.append(f"- **{item.get('scenario_id')}** [{item.get('module')}] {item.get('scenario')}")
            lines.append(f"  - Role: {item.get('role')}")
            lines.append(f"  - Next action: {item.get('next_action')}")
    else:
        lines.append("_No scenarios are currently queued for manual exploratory execution._")

    lines.extend(["", "## Already Executed", ""])
    if executed_items:
        for item in _sorted(executed_items):
            lines.append(
                f"- **{item.get('scenario_id')}** [{item.get('module')}] {item.get('scenario')} — {item.get('execution_status')}"
            )
            lines.append(f"  - Mapped test: {item.get('mapped_test')}")
    else:
        lines.append("_No Playwright-mapped scenario has produced pass/fail evidence in the latest run._")

    lines.append("")
    return "\n".join(lines)


def render_automation_candidates(queue: list[dict]) -> str:
    candidates = [item for item in queue if item.get("execution_mode") == "automation_candidate"]
    priorities = [
        ("1. RBAC / unauthorized access", ["admin dashboard", "finance route", "unauthorized", "rbac", "protected page"]),
        ("2. Cross-tenant access", ["tenant", "cross-tenant", "another tenant"]),
        ("3. Documents private data", ["private driver salary/medical", "private document"]),
        ("4. Assignment/license conflict", ["license class", "overlapping jobs", "leave day conflicts with an assignment"]),
        ("5. Export finance visibility", ["export", "finance data"]),
        ("6. Request/calendar sync", ["calendar event", "request", "leave approval"]),
        ("7. Reminder/compliance generation", ["reminder", "compliance", "expired document"]),
    ]

    lines = [
        "# Automation Candidates",
        "",
        "These are the next scenarios that should move from planned coverage into",
        "repeatable Playwright evidence, in risk-priority order.",
        "",
    ]

    for heading, phrases in priorities:
        lines.append(f"## {heading}")
        lines.append("")
        matches = _priority_matches(candidates, phrases)
        if matches:
            for item in matches:
                lines.append(f"- **{item.get('scenario_id')}** [{item.get('module')}] {item.get('scenario')}")
                lines.append(f"  - Risk: {item.get('risk_level')}")
                lines.append(f"  - Role: {item.get('role')}")
                lines.append(f"  - Next action: {item.get('next_action')}")
        else:
            lines.append("_No current automation candidate in this priority band._")
        lines.append("")

    return "\n".join(lines)


def render_manual_exploratory_queue(queue: list[dict]) -> str:
    manual_items = [item for item in queue if item.get("execution_mode") == "manual_exploratory"]
    lines = [
        "# Manual Exploratory Queue",
        "",
        "These scenarios require human exploratory execution and should not be",
        "misrepresented as automated coverage.",
        "",
    ]

    preferred_order = ["auth", "documents", "einsatzplan", "requests", "export", "drivers", "vehicles"]
    grouped = dict(_module_groups(manual_items))
    ordered_modules = [module for module in preferred_order if module in grouped]
    ordered_modules.extend(module for module in sorted(grouped) if module not in ordered_modules)

    if not manual_items:
        lines.append("_No scenarios are currently queued for manual exploratory execution._")
        lines.append("")
        return "\n".join(lines)

    for module in ordered_modules:
        lines.append(f"## {module}")
        lines.append("")
        for item in _sorted(grouped[module]):
            lines.append(f"- **{item.get('scenario_id')}** {item.get('scenario')}")
            lines.append(f"  - Risk: {item.get('risk_level')}")
            lines.append(f"  - Role: {item.get('role')}")
            lines.append(f"  - Next action: {item.get('next_action')}")
        lines.append("")

    return "\n".join(lines)


def render_blocked_scenarios(queue: list[dict]) -> str:
    blocked_items = [item for item in queue if item.get("execution_mode") == "blocked"]
    lines = [
        "# Blocked Scenarios",
        "",
        "These scenarios were not honestly executable end-to-end in the latest run.",
        "Each entry names every blocker and the exact unblock action.",
        "",
    ]

    if not blocked_items:
        lines.append("_No blocked scenarios were identified in the latest queue._")
        lines.append("")
        return "\n".join(lines)

    for item in _sorted(blocked_items):
        lines.append(f"## {item.get('scenario_id')} — {item.get('scenario')}")
        lines.append("")
        lines.append(f"- Module: {item.get('module')}")
        lines.append(f"- Role: {item.get('role')}")
        lines.append(f"- Blocker types: {', '.join(blocker.get('type', '') for blocker in item.get('blockers', []))}")
        lines.append("- Blocker details:")
        for blocker in item.get("blockers", []):
            lines.append(f"  - [{blocker.get('type')}] {blocker.get('detail')}")
        lines.append("- Exact unblock actions:")
        for blocker in item.get("blockers", []):
            lines.append(f"  - {blocker.get('unblock_action')}")
        lines.append("")

    return "\n".join(lines)


def write_execution_queue_reports(queue: list[dict]) -> tuple[dict[str, str], dict]:
    consistency = validate_execution_queue(queue)
    paths = {
        "scenario_execution_queue": _write(
            "reports",
            "scenario_execution_queue.md",
            render_scenario_execution_queue(queue, consistency),
        ),
        "automation_candidates": _write(
            "reports",
            "automation_candidates.md",
            render_automation_candidates(queue),
        ),
        "manual_exploratory_queue": _write(
            "reports",
            "manual_exploratory_queue.md",
            render_manual_exploratory_queue(queue),
        ),
        "blocked_scenarios": _write(
            "reports",
            "blocked_scenarios.md",
            render_blocked_scenarios(queue),
        ),
        "queue_consistency_check": _write(
            "reports",
            "queue_consistency_check.md",
            render_queue_consistency_check(consistency),
        ),
    }
    return paths, consistency
