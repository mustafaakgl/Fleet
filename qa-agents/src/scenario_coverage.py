"""Phase 7D: scenario coverage tracker.

Builds a conservative bridge between the full-system exploratory scenario matrix
and actual Playwright execution evidence. The key rule is that the generated
matrix (168 scenarios today) is a *plan*, not proof of execution. Only explicit
matches to a real Playwright test title count as automated coverage.
"""

from __future__ import annotations

import json
import os


_ROOT = os.path.dirname(os.path.dirname(__file__))
_SCENARIO_MAPPING_PATH = os.path.join(_ROOT, "matrix", "scenario_mapping.json")


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


def _normalize(text: str) -> str:
    return " ".join((text or "").lower().replace("_", " ").split())


def _load_scenario_mapping() -> list[dict]:
    """Load explicit Playwright-to-matrix mappings from matrix/scenario_mapping.json."""
    if not os.path.isfile(_SCENARIO_MAPPING_PATH):
        return []
    try:
        with open(_SCENARIO_MAPPING_PATH, "r", encoding="utf-8") as handle:
            text = handle.read()
        data = json.loads(text) if text.strip() else []
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError, ValueError):
        return []


def _title_for(suite_title: str, spec_title: str) -> str:
    parts = [part for part in (suite_title, spec_title) if part]
    return " > ".join(parts) if parts else (spec_title or "(untitled test)")


def _skip_reason(test: dict) -> str:
    """Extract a human skip reason from Playwright JSON when one exists."""
    sources = [test]
    sources.extend(test.get("results", []) or [])

    for source in sources:
        for annotation in source.get("annotations", []) or []:
            description = (annotation.get("description") or "").strip()
            if description:
                return description

    for source in sources:
        for error in source.get("errors", []) or []:
            message = (error.get("message") or "").strip()
            if message:
                return message

    return ""


def parse_playwright_tests(playwright_results: dict) -> list[dict]:
    """Return a flat list of Playwright tests with title/status/reason.

    Each item has:
        title, file, status, skip_reason
    """
    report = _load_raw_report(playwright_results)
    tests: list[dict] = []

    def walk_suite(suite: dict, prefix: str, file_path: str) -> None:
        suite_title = suite.get("title", "") or ""
        combined = " > ".join([part for part in (prefix, suite_title) if part])
        inherited_file = suite.get("file") or file_path

        for spec in suite.get("specs", []) or []:
            spec_title = spec.get("title", "") or ""
            title = _title_for(combined, spec_title)
            spec_file = spec.get("file") or inherited_file or ""

            for test in spec.get("tests", []) or []:
                status = test.get("status")
                results = test.get("results", []) or []
                last = results[-1] if results else {}
                outcome = status or last.get("status") or "unknown"
                if outcome in ("expected", "passed", "flaky"):
                    normalized = "passed"
                elif outcome in ("unexpected", "failed", "timedOut", "interrupted"):
                    normalized = "failed"
                elif outcome == "skipped":
                    normalized = "skipped"
                else:
                    normalized = "skipped"

                tests.append(
                    {
                        "title": title,
                        "file": spec_file,
                        "status": normalized,
                        "skip_reason": _skip_reason(test),
                    }
                )

        for child in suite.get("suites", []) or []:
            walk_suite(child, combined, inherited_file)

    for suite in report.get("suites", []) or []:
        walk_suite(suite, "", suite.get("file") or "")

    return tests


def summarize_playwright_results(playwright_results: dict) -> dict:
    """Summarize actual Playwright test execution from the raw report."""
    tests = parse_playwright_tests(playwright_results)
    passed = sum(1 for test in tests if test["status"] == "passed")
    failed = sum(1 for test in tests if test["status"] == "failed")
    skipped = sum(1 for test in tests if test["status"] == "skipped")
    return {
        "tests": tests,
        "automated": len(tests),
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
    }


def _is_blocker_reason(reason: str) -> bool:
    lowered = _normalize(reason)
    blocker_markers = (
        "missing .auth",
        "blocked by",
        "no stable selector",
        "no seeded",
        "detail route",
        "testability",
        "missing test data",
    )
    return any(marker in lowered for marker in blocker_markers)


def _next_action_from_reason(reason: str) -> str:
    lowered = _normalize(reason)
    if "missing .auth/driver.json" in lowered:
        return "Add DRIVER_* credentials to e2e/.env.e2e and re-run Playwright."
    if "missing .auth/office.json" in lowered:
        return "Add OFFICE_* credentials to e2e/.env.e2e and re-run Playwright."
    if "private driver salary/medical" in lowered or "stable selector" in lowered:
        return "Expose a stable private-document selector and seed a private document."
    if "detail route" in lowered or "direct-id" in lowered:
        return "Document or expose a document-detail route and seed a known document id."
    if "tenant_b" in lowered or "cross-tenant" in lowered:
        return "Seed a tenant_b document id so cross-tenant access can be exercised."
    return "Resolve the blocker described in the skip reason, then re-run Playwright."


def _credential_blocker_reason(reason: str) -> str:
    """Normalize auth-storage skip reasons into local-credential blocker text."""
    lowered = _normalize(reason)
    if "missing .auth/driver.json" in lowered:
        return "Missing local credentials: DRIVER_EMAIL and DRIVER_PASSWORD are not configured in e2e/.env.e2e."
    if "missing .auth/office.json" in lowered:
        return "Missing local credentials: OFFICE_EMAIL and OFFICE_PASSWORD are not configured in e2e/.env.e2e."
    if "missing .auth/admin.json" in lowered:
        return "Missing local credentials: ADMIN_EMAIL and ADMIN_PASSWORD are not configured in e2e/.env.e2e."
    if "missing .auth/boss.json" in lowered:
        return "Missing local credentials: BOSS_EMAIL and BOSS_PASSWORD are not configured in e2e/.env.e2e."
    if "missing .auth/accounting.json" in lowered:
        return "Missing local credentials: ACCOUNTING_EMAIL and ACCOUNTING_PASSWORD are not configured in e2e/.env.e2e."
    return reason


def _mapping_index(mapping_rows: list[dict]) -> dict[str, list[dict]]:
    """Index scenario mappings by matrix scenario id."""
    index: dict[str, list[dict]] = {}
    for row in mapping_rows:
        for scenario_id in row.get("scenario_ids", []) or []:
            index.setdefault(str(scenario_id), []).append(row)
    return index


def _mapped_tests_for_scenario(
    scenario_row: dict,
    tests: list[dict],
    mapping_index: dict[str, list[dict]],
) -> list[dict]:
    """Return explicitly mapped Playwright tests for one matrix scenario."""
    scenario_id = str(scenario_row.get("id", ""))
    mappings = mapping_index.get(scenario_id, [])
    if not mappings:
        return []

    matches: list[dict] = []
    for mapping in mappings:
        wanted_file = _normalize(mapping.get("test_file", ""))
        wanted_title = _normalize(mapping.get("test_title", ""))

        for test in tests:
            test_file = _normalize(test.get("file", ""))
            test_title = _normalize(test.get("title", ""))
            same_file = test_file == wanted_file
            same_title = test_title == wanted_title or test_title.endswith(wanted_title)
            if not (same_file and same_title):
                continue

            match = dict(test)
            match["mapping_confidence"] = mapping.get("mapping_confidence", "")
            match["mapping_notes"] = mapping.get("notes", "")
            matches.append(match)
    return matches


def _unmapped_blocker_reason(scenario_row: dict) -> str:
    """Return a known blocker for a non-mapped matrix scenario, if any."""
    scenario = _normalize(scenario_row.get("scenario", ""))
    module = _normalize(scenario_row.get("module", ""))

    if module == "documents" and "private driver salary/medical documents" in scenario:
        return (
            "Blocked by testability: no stable selector identifies private driver "
            "salary/medical documents, and no seeded private-document fixture is guaranteed."
        )
    if module == "documents" and "direct-id access" in scenario:
        return (
            "Blocked by missing route/test data: no document-detail route is exposed "
            "and no deterministic document id is seeded for unauthorized-access checks."
        )
    if module == "documents" and "another tenant's document" in scenario:
        return (
            "Blocked by missing cross-tenant test data: no tenant_b document id is "
            "available to drive a browser-level isolation check."
        )

    return ""


def _build_item_for_matches(scenario_row: dict, matches: list[dict]) -> dict:
    titles = [match["title"] for match in matches]
    statuses = {match["status"] for match in matches}
    reasons = [match["skip_reason"] for match in matches if match.get("skip_reason")]
    blocker_reason = " ".join(dict.fromkeys(reasons))

    if "failed" in statuses:
        execution_type = "automated/playwright"
        execution_status = "failed"
        evidence_status = "evidence_found"
        next_action = "Inspect the Playwright evidence and triage the failure."
        blocker_reason = ""
    elif reasons and any(_is_blocker_reason(reason) for reason in reasons):
        execution_type = "blocker"
        execution_status = "blocked"
        evidence_status = "not_executed"
        blocker_reason = _credential_blocker_reason(blocker_reason)
        next_action = _next_action_from_reason(blocker_reason)
    elif "skipped" in statuses:
        execution_type = "automated/playwright"
        execution_status = "skipped"
        evidence_status = "not_executed"
        next_action = "Resolve the skip preconditions, then re-run Playwright."
    else:
        execution_type = "automated/playwright"
        execution_status = "passed"
        evidence_status = "evidence_found"
        next_action = "Keep this scenario in regression coverage and widen adjacent automation if needed."
        blocker_reason = ""

    return {
        "scenario_id": scenario_row.get("id", ""),
        "module": scenario_row.get("module", ""),
        "risk_level": scenario_row.get("risk_level", ""),
        "principle": scenario_row.get("principle", ""),
        "category": scenario_row.get("category", ""),
        "role": scenario_row.get("role", ""),
        "scenario": scenario_row.get("scenario", ""),
        "execution_type": execution_type,
        "execution_status": execution_status,
        "mapped_test": "; ".join(titles),
        "evidence_status": evidence_status,
        "blocker_reason": blocker_reason,
        "next_action": next_action,
    }


def build_scenario_coverage(test_matrix: list[dict], playwright_results: dict) -> list[dict]:
    """Build scenario coverage items from the matrix and Playwright evidence."""
    executed = bool(playwright_results.get("executed"))
    tests = summarize_playwright_results(playwright_results)["tests"]
    mapping_index = _mapping_index(_load_scenario_mapping())
    items: list[dict] = []

    for scenario_row in test_matrix or []:
        if not executed:
            items.append(
                {
                    "scenario_id": scenario_row.get("id", ""),
                    "module": scenario_row.get("module", ""),
                    "risk_level": scenario_row.get("risk_level", ""),
                    "principle": scenario_row.get("principle", ""),
                    "category": scenario_row.get("category", ""),
                    "role": scenario_row.get("role", ""),
                    "scenario": scenario_row.get("scenario", ""),
                    "execution_type": "not_mapped",
                    "execution_status": "manual_needed",
                    "mapped_test": "",
                    "evidence_status": "not_executed",
                    "blocker_reason": "",
                    "next_action": "Run this scenario manually or add explicit Playwright coverage.",
                }
            )
            continue

        matches = _mapped_tests_for_scenario(scenario_row, tests, mapping_index)
        if matches:
            items.append(_build_item_for_matches(scenario_row, matches))
            continue

        blocker_reason = _unmapped_blocker_reason(scenario_row)
        if blocker_reason:
            items.append(
                {
                    "scenario_id": scenario_row.get("id", ""),
                    "module": scenario_row.get("module", ""),
                    "risk_level": scenario_row.get("risk_level", ""),
                    "principle": scenario_row.get("principle", ""),
                    "category": scenario_row.get("category", ""),
                    "role": scenario_row.get("role", ""),
                    "scenario": scenario_row.get("scenario", ""),
                    "execution_type": "blocker",
                    "execution_status": "blocked",
                    "mapped_test": "",
                    "evidence_status": "not_executed",
                    "blocker_reason": blocker_reason,
                    "next_action": _next_action_from_reason(blocker_reason),
                }
            )
            continue

        items.append(
            {
                "scenario_id": scenario_row.get("id", ""),
                "module": scenario_row.get("module", ""),
                "risk_level": scenario_row.get("risk_level", ""),
                "principle": scenario_row.get("principle", ""),
                "category": scenario_row.get("category", ""),
                "role": scenario_row.get("role", ""),
                "scenario": scenario_row.get("scenario", ""),
                "execution_type": "not_mapped",
                "execution_status": "not_run",
                "mapped_test": "",
                "evidence_status": "no_evidence",
                "blocker_reason": "",
                "next_action": "Manual exploratory execution is still needed; add explicit automation if this scenario should be exercised in Playwright.",
            }
        )

    return items