"""Phase 8B: hardened scenario execution queue classification.

This module classifies every matrix scenario into an honest execution queue.
It treats the final queue rows as the source of truth for all downstream
summary counts and reporting.
"""

from __future__ import annotations

ALLOWED_EXECUTION_MODES = {
    "automated_playwright",
    "manual_exploratory",
    "blocked",
    "not_ready",
    "automation_candidate",
}

ALLOWED_BLOCKER_TYPES = {
    "missing_credentials",
    "missing_seed_data",
    "missing_selector",
    "missing_route",
    "unclear_requirement",
    "missing_fixture",
    "missing_mapping",
}


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().replace("_", " ").split())


def _role_index(test_roles: list[dict]) -> dict[str, dict]:
    return {str(role.get("role_id", "")): role for role in test_roles or []}


def _coverage_index(scenario_coverage: list[dict]) -> dict[str, dict]:
    return {
        str(item.get("scenario_id", "")): item
        for item in scenario_coverage or []
        if item.get("scenario_id")
    }


def _format_role(role_id: str, roles: dict[str, dict]) -> str:
    role = roles.get(role_id)
    if not role:
        return role_id
    app_role = role.get("app_role") or role_id
    tenant = role.get("tenant") or "unknown_tenant"
    return f"{app_role} ({tenant})"


def _make_blocker(blocker_type: str, detail: str, unblock_action: str) -> dict:
    blocker_type = blocker_type if blocker_type in ALLOWED_BLOCKER_TYPES else "unclear_requirement"
    return {
        "type": blocker_type,
        "detail": detail.strip(),
        "unblock_action": unblock_action.strip(),
    }


def _append_blocker(blockers: list[dict], blocker: dict) -> None:
    key = (blocker.get("type", ""), blocker.get("detail", ""))
    existing = {
        (entry.get("type", ""), entry.get("detail", ""))
        for entry in blockers
    }
    if key not in existing:
        blockers.append(blocker)


def _scenario_specific_blockers(scenario_row: dict) -> list[dict]:
    module = _normalize(scenario_row.get("module", ""))
    scenario = _normalize(scenario_row.get("scenario", ""))
    blockers: list[dict] = []

    if module != "documents":
        return blockers

    if "private driver salary/medical documents" in scenario:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_selector",
                "No stable selector marks private driver salary/medical documents on the documents screen.",
                "Expose a stable selector or attribute for private documents so visibility can be asserted.",
            ),
        )
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_seed_data",
                "No deterministic private driver salary/medical document is guaranteed to exist for the scenario.",
                "Seed a private driver salary/medical document fixture for the target tenant and role.",
            ),
        )
    if "direct-id access" in scenario or "another tenant's document" in scenario:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_route",
                "No document-detail route or documented API pattern is available for deterministic direct-ID access attempts.",
                "Document or expose the document-detail route or API surface used for direct-ID authorization checks.",
            ),
        )
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_seed_data",
                "No deterministic document id is seeded for unauthorized direct-ID access checks.",
                "Seed a deterministic document id that the unauthorized role can attempt to access.",
            ),
        )
    if "another tenant's document" in scenario:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_fixture",
                "No tenant_b document fixture is identified for browser-level cross-tenant access verification.",
                "Seed a tenant_b document fixture and surface its id for the scenario.",
            ),
        )
    if "owner-type mismatch between a document and its owner" in scenario:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_seed_data",
                "No deterministic owner/document mismatch fixture exists to prove owner-type validation.",
                "Seed a deterministic owner/document mismatch fixture and re-run the scenario.",
            ),
        )
    if "expired document should drive a compliance reminder" in scenario:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_fixture",
                "No deterministic expired-document fixture and expected compliance reminder outcome are defined.",
                "Seed an expired document fixture and define the expected reminder/compliance outcome for the run.",
            ),
        )

    return blockers


def _blockers_from_coverage_reason(reason: str) -> list[dict]:
    lowered = _normalize(reason)
    if not lowered:
        return []

    blockers: list[dict] = []
    if ".auth/" in lowered or "missing local credentials" in lowered:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_credentials",
                reason.strip(),
                "Add the missing role credentials to e2e/.env.e2e, regenerate the related .auth state, and re-run Playwright.",
            ),
        )
    if "stable selector" in lowered or "testability" in lowered:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_selector",
                reason.strip(),
                "Expose a stable selector or attribute for the target UI state, then re-run the scenario.",
            ),
        )
    if "route" in lowered or "api" in lowered or "detail route" in lowered:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_route",
                reason.strip(),
                "Document or expose the missing route/API surface and provide a deterministic target id for the scenario.",
            ),
        )
    if "seed" in lowered or "test data" in lowered or "fixture" in lowered:
        _append_blocker(
            blockers,
            _make_blocker(
                "missing_seed_data",
                reason.strip(),
                "Seed deterministic test data or fixtures for this scenario, then re-run the relevant coverage.",
            ),
        )
    if "unclear" in lowered or "undefined" in lowered or "requirement" in lowered:
        _append_blocker(
            blockers,
            _make_blocker(
                "unclear_requirement",
                reason.strip(),
                "Clarify the requirement or expected behavior before scheduling execution.",
            ),
        )

    return blockers


def _is_broad_exploratory_scenario(row: dict) -> bool:
    scenario = _normalize(row.get("scenario", ""))
    principle = _normalize(row.get("principle", ""))
    category = _normalize(row.get("category", ""))

    if scenario.startswith("apply ") and "capture evidence" in scenario:
        return True
    if principle in {
        "risk-based testing",
        "charter-based exploratory testing",
        "evidence-based bug reporting",
    }:
        return True
    if category in {"ui/ux", "business flow"} and "explore" in scenario:
        return True
    return False


def _is_concrete_automation_candidate(row: dict) -> bool:
    scenario = _normalize(row.get("scenario", ""))
    expected = _normalize(row.get("expected_result", ""))

    if not scenario or not expected:
        return False
    if _is_broad_exploratory_scenario(row):
        return False

    concrete_markers = (
        "attempts to",
        "should",
        "upload",
        "export",
        "approval",
        "assign",
        "conflicts",
        "overlapping",
        "reject",
        "direct-id",
        "view",
        "access",
        "refresh",
        "renewing",
        "creates",
    )
    return any(marker in scenario for marker in concrete_markers)


def _is_not_ready(row: dict) -> bool:
    scenario = _normalize(row.get("scenario", ""))
    expected = _normalize(row.get("expected_result", ""))
    role = _normalize(row.get("role", ""))

    if not role or not scenario:
        return True
    if not expected:
        return True
    if _is_broad_exploratory_scenario(row) and "explore" not in scenario and "apply" not in scenario:
        return True
    return False


def _next_action_for_blockers(blockers: list[dict]) -> str:
    if not blockers:
        return "Resolve the execution blockers, then re-run the scenario."
    actions = []
    for blocker in blockers:
        action = blocker.get("unblock_action", "").strip()
        if action and action not in actions:
            actions.append(action)
    return " ".join(actions)


def _priority_order(item: dict) -> int:
    risk = item.get("risk_level")
    mode = item.get("execution_mode")
    status = item.get("execution_status")

    if mode == "blocked" and risk in ("Critical", "High"):
        return 1
    if mode == "automation_candidate" and risk in ("Critical", "High"):
        return 2
    if mode == "manual_exploratory":
        return 3
    if mode == "automated_playwright" and status == "failed":
        return 4
    if mode == "automated_playwright" and status == "skipped":
        return 5
    if mode == "automated_playwright" and status == "passed":
        return 6
    if mode == "blocked":
        return 7
    if mode == "automation_candidate":
        return 8
    return 9


def _base_item(row: dict, role_label: str, mapped_test: str) -> dict:
    return {
        "scenario_id": str(row.get("id", "")),
        "module": row.get("module", ""),
        "risk_level": row.get("risk_level", ""),
        "category": row.get("category", ""),
        "role": role_label,
        "scenario": row.get("scenario", ""),
        "execution_mode": "not_ready",
        "execution_status": "not_run",
        "mapped_test": mapped_test,
        "evidence_status": "not_executed",
        "missing_requirements": [],
        "blockers": [],
        "next_action": "",
        "priority_order": 9,
    }


def build_execution_queue(
    test_matrix: list[dict],
    scenario_coverage: list[dict],
    test_roles: list[dict],
    playwright_results: dict,
) -> list[dict]:
    """Build an honest execution queue for every matrix scenario."""
    del playwright_results

    coverage_by_id = _coverage_index(scenario_coverage)
    roles = _role_index(test_roles)
    queue: list[dict] = []

    for row in test_matrix or []:
        scenario_id = str(row.get("id", ""))
        coverage = coverage_by_id.get(scenario_id, {})
        mapped_test = coverage.get("mapped_test", "") or ""
        role_id = str(row.get("role", ""))
        item = _base_item(row, _format_role(role_id, roles), mapped_test)

        if mapped_test:
            item["execution_mode"] = "automated_playwright"
            item["mapped_test"] = mapped_test
            status = coverage.get("execution_status") or "not_run"
            blocker_reason = coverage.get("blocker_reason") or ""
            blockers = _blockers_from_coverage_reason(blocker_reason)
            item["blockers"] = blockers
            item["missing_requirements"] = [b["detail"] for b in blockers]

            if status == "passed":
                item["execution_status"] = "passed"
                item["evidence_status"] = "evidence_found"
                item["next_action"] = (
                    "Keep this mapped Playwright scenario in regression coverage and widen adjacent automation only when needed."
                )
            elif status == "failed":
                item["execution_status"] = "failed"
                item["evidence_status"] = "evidence_found"
                item["next_action"] = (
                    "Inspect the captured Playwright evidence and triage the failure before changing coverage claims."
                )
            else:
                item["execution_status"] = "skipped"
                item["evidence_status"] = "no_evidence"
                if not item["missing_requirements"]:
                    item["missing_requirements"] = [
                        blocker_reason or "Playwright defined this scenario but it did not execute in the latest run."
                    ]
                item["next_action"] = (
                    coverage.get("next_action")
                    or _next_action_for_blockers(blockers)
                    or "Resolve the skip precondition and re-run Playwright for real evidence."
                )

            item["priority_order"] = _priority_order(item)
            queue.append(item)
            continue

        blockers = _scenario_specific_blockers(row)
        for blocker in _blockers_from_coverage_reason(coverage.get("blocker_reason", "")):
            _append_blocker(blockers, blocker)

        if coverage.get("execution_status") == "blocked" or blockers:
            item["execution_mode"] = "blocked"
            item["execution_status"] = "blocked"
            item["evidence_status"] = "no_evidence"
            item["blockers"] = blockers or [
                _make_blocker(
                    "unclear_requirement",
                    coverage.get("blocker_reason") or "Execution is blocked by an unresolved prerequisite.",
                    "Clarify the unresolved prerequisite and re-run the scenario.",
                )
            ]
            item["missing_requirements"] = [b["detail"] for b in item["blockers"]]
            item["next_action"] = _next_action_for_blockers(item["blockers"])
            item["priority_order"] = _priority_order(item)
            queue.append(item)
            continue

        if _is_broad_exploratory_scenario(row):
            item["execution_mode"] = "manual_exploratory"
            item["execution_status"] = "manual_needed"
            item["evidence_status"] = "not_executed"
            item["next_action"] = (
                "Run this scenario as a human exploratory session and capture findings separately from automated evidence."
            )
            item["priority_order"] = _priority_order(item)
            queue.append(item)
            continue

        if _is_not_ready(row):
            item["execution_mode"] = "not_ready"
            item["execution_status"] = "not_run"
            item["evidence_status"] = "not_executed"
            item["blockers"] = [
                _make_blocker(
                    "missing_mapping",
                    "The scenario is too generic or lacks enough discovered surface detail to schedule cleanly as automation or manual execution.",
                    "Refine the route, role, and assertion so the scenario can move into manual exploration or automation planning.",
                )
            ]
            item["missing_requirements"] = [b["detail"] for b in item["blockers"]]
            item["next_action"] = item["blockers"][0]["unblock_action"]
            item["priority_order"] = _priority_order(item)
            queue.append(item)
            continue

        if _is_concrete_automation_candidate(row):
            item["execution_mode"] = "automation_candidate"
            item["execution_status"] = "not_run"
            item["evidence_status"] = "no_evidence"
            item["next_action"] = (
                "Add explicit Playwright coverage for this concrete scenario so it moves from planned coverage into repeatable execution evidence."
            )
            item["priority_order"] = _priority_order(item)
            queue.append(item)
            continue

        item["execution_mode"] = "manual_exploratory"
        item["execution_status"] = "manual_needed"
        item["evidence_status"] = "not_executed"
        item["next_action"] = (
            "Run this scenario manually and capture evidence, then decide whether it should remain exploratory or become automated."
        )
        item["priority_order"] = _priority_order(item)
        queue.append(item)

    queue.sort(key=lambda entry: (entry.get("priority_order", 99), entry.get("scenario_id", "")))
    return queue


__all__ = [
    "ALLOWED_BLOCKER_TYPES",
    "ALLOWED_EXECUTION_MODES",
    "build_execution_queue",
]
