"""Phase 8B: execution queue consistency validation."""

from __future__ import annotations

from scenario_execution_queue import ALLOWED_EXECUTION_MODES


def _count(queue: list[dict], *, mode: str | None = None, status: str | None = None) -> int:
    total = 0
    for item in queue:
        if mode and item.get("execution_mode") != mode:
            continue
        if status and item.get("execution_status") != status:
            continue
        total += 1
    return total


def validate_execution_queue(queue: list[dict]) -> dict:
    errors: list[str] = []
    total = len(queue)
    automated = _count(queue, mode="automated_playwright")
    automation_candidate = _count(queue, mode="automation_candidate")
    manual_exploratory = _count(queue, mode="manual_exploratory")
    blocked = _count(queue, mode="blocked")
    not_ready = _count(queue, mode="not_ready")
    passed = _count(queue, status="passed")
    failed = _count(queue, status="failed")
    skipped = _count(queue, status="skipped")

    mode_total = automated + automation_candidate + manual_exploratory + blocked + not_ready
    if total != mode_total:
        errors.append(
            f"Mode counts do not sum to total: total={total}, summed_modes={mode_total}."
        )

    blocked_report_count = sum(1 for item in queue if item.get("execution_mode") == "blocked")
    if blocked != blocked_report_count:
        errors.append(
            f"Blocked count mismatch: blocked={blocked}, blocked_report_count={blocked_report_count}."
        )

    for item in queue:
        scenario_id = str(item.get("scenario_id", "")).strip()
        if not scenario_id:
            errors.append("A queue row is missing scenario_id.")

        mode = item.get("execution_mode")
        if mode not in ALLOWED_EXECUTION_MODES:
            errors.append(
                f"Scenario {scenario_id or '(missing id)'} has unknown execution_mode: {mode!r}."
            )

        status = item.get("execution_status")
        if status in ("passed", "failed", "skipped") and mode != "automated_playwright":
            errors.append(
                f"Scenario {scenario_id or '(missing id)'} has status {status!r} without automated_playwright mode."
            )

        if mode == "automated_playwright" and not item.get("mapped_test"):
            errors.append(
                f"Scenario {scenario_id or '(missing id)'} is automated_playwright but has no mapped_test."
            )

    return {
        "total": total,
        "automated_playwright": automated,
        "automation_candidate": automation_candidate,
        "manual_exploratory": manual_exploratory,
        "blocked": blocked,
        "not_ready": not_ready,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "errors": errors,
    }
