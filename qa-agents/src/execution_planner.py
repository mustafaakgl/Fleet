"""Phase 9: execution-first planner.

Select the next high-priority scenarios for real browser execution.
"""

from __future__ import annotations


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().split())


def _priority_rank(module: str, scenario: str) -> int:
    text = f"{_normalize(module)} {_normalize(scenario)}"
    checks = [
        (1, ["auth", "rbac", "dashboard", "protected", "logout"]),
        (2, ["documents rbac", "driver portal documents", "admin documents", "documents"]),
        (3, ["cross-tenant", "direct-id", "tenant"]),
        (4, ["finance visibility", "finance", "billing", "revenue"]),
        (5, ["driver", "admin dashboard"]),
        (6, ["export", "csv"]),
        (7, ["requests", "calendar"]),
        (8, ["reminder", "compliance"]),
    ]
    for rank, keywords in checks:
        if any(keyword in text for keyword in keywords):
            return rank
    return 99


def _required_credentials(role_label: str, scenario: str) -> list[str]:
    role = _normalize(role_label)
    scenario_text = _normalize(scenario)

    if "unauthenticated" in scenario_text:
        return []
    if "driver" in role or "driver" in scenario_text:
        return ["DRIVER_EMAIL", "DRIVER_PASSWORD"]
    if "office" in role or "office" in scenario_text:
        return ["OFFICE_EMAIL", "OFFICE_PASSWORD"]
    if "accounting" in role or "accounting" in scenario_text:
        return ["ACCOUNTING_EMAIL", "ACCOUNTING_PASSWORD"]
    if "boss" in role or "boss" in scenario_text:
        return ["BOSS_EMAIL", "BOSS_PASSWORD"]
    return ["ADMIN_EMAIL", "ADMIN_PASSWORD"]


def _is_concrete(scenario: str, expected_result: str) -> bool:
    sc = _normalize(scenario)
    ex = _normalize(expected_result)
    if not sc or not ex:
        return False
    if sc.startswith("apply ") and "capture evidence" in sc:
        return False
    concrete_markers = (
        "cannot",
        "should",
        "access",
        "redirect",
        "upload",
        "export",
        "logout",
        "back",
        "calendar",
        "route",
    )
    return any(marker in sc for marker in concrete_markers)


def _required_data_from_blockers(blockers: list[dict]) -> list[str]:
    return [b.get("detail", "") for b in blockers or [] if b.get("detail")]


_PREFERRED_SCENARIO_IDS = [
    "TM-001",
    "TM-002",
    "TM-057",
    "TM-003",
    "TM-004",
    "TM-060",
    "TM-050",
    "TM-051",
    "TM-063",
    "TM-148",
    "TM-098",
]


def build_execution_plan(
    execution_queue: list[dict],
    test_matrix: list[dict],
    max_tests: int = 20,
) -> list[dict]:
    """Build the next scenarios to execute now.

    Uses the final execution queue as truth, then picks Critical/High scenarios
    that are already automated_playwright or automation_candidate.
    """
    matrix_by_id = {str(item.get("id", "")): item for item in test_matrix or []}

    queue_by_id = {str(row.get("scenario_id", "")): row for row in execution_queue or []}

    def to_plan_item(row: dict) -> dict:
        scenario_id = str(row.get("scenario_id", ""))
        matrix_row = matrix_by_id.get(scenario_id, {})
        scenario = row.get("scenario", "")
        expected = matrix_row.get("expected_result", "")
        mapped_test = row.get("mapped_test", "")
        mode = row.get("execution_mode", "")
        blockers = row.get("blockers", []) or []

        create_new = mode == "automation_candidate" and _is_concrete(scenario, expected)
        blocked = mode == "blocked" or (mode == "automation_candidate" and not create_new)

        return {
            "scenario_id": scenario_id,
            "module": row.get("module", ""),
            "role": row.get("role", ""),
            "scenario": scenario,
            "test_type": "existing_playwright" if mapped_test else "generated_playwright",
            "existing_playwright_test": mapped_test,
            "new_playwright_test_required": bool(create_new),
            "required_credentials": _required_credentials(row.get("role", ""), scenario),
            "required_data": _required_data_from_blockers(blockers),
            "expected_result": expected,
            "blocked": bool(blocked),
            "blocker_reason": row.get("next_action", "") if blocked else "",
            "priority_rank": _priority_rank(row.get("module", ""), scenario),
        }

    candidates: list[dict] = []

    for scenario_id in _PREFERRED_SCENARIO_IDS:
        row = queue_by_id.get(scenario_id)
        if not row:
            continue
        if row.get("risk_level") not in ("Critical", "High"):
            continue
        candidates.append(to_plan_item(row))

    for row in execution_queue or []:
        scenario_id = str(row.get("scenario_id", ""))
        if scenario_id in {item.get("scenario_id") for item in candidates}:
            continue
        if row.get("risk_level") not in ("Critical", "High"):
            continue
        if row.get("execution_mode") not in ("automated_playwright", "automation_candidate", "blocked"):
            continue
        candidates.append(to_plan_item(row))

    candidates.sort(
        key=lambda item: (
            item.get("priority_rank", 99),
            0 if item.get("test_type") == "existing_playwright" else 1,
            1 if item.get("blocked") else 0,
            item.get("scenario_id", ""),
        )
    )

    return candidates[: max(1, max_tests)]
