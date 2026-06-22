"""Phase 9B: write execution-first report with full Playwright visibility."""

from __future__ import annotations

import json
import os
import re


_ROOT = os.path.dirname(os.path.dirname(__file__))
_TM_ID_PATTERN = re.compile(r"\[TM-\d+\]")
_ANSI_ESCAPE_PATTERN = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def _write(rel_dir: str, filename: str, content: str) -> str:
    target_dir = os.path.join(_ROOT, rel_dir)
    os.makedirs(target_dir, exist_ok=True)
    path = os.path.join(target_dir, filename)
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return path


def _load_report(playwright_results: dict) -> dict:
    raw_path = playwright_results.get("raw_results_path")
    if not raw_path or not os.path.isfile(raw_path):
        return {}
    try:
        with open(raw_path, "r", encoding="utf-8") as handle:
            text = handle.read()
        return json.loads(text) if text.strip() else {}
    except (OSError, ValueError, json.JSONDecodeError):
        return {}


def _load_scenario_mapping() -> list[dict]:
    path = os.path.join(_ROOT, "matrix", "scenario_mapping.json")
    if not os.path.isfile(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        return data if isinstance(data, list) else []
    except (OSError, ValueError, json.JSONDecodeError):
        return []


def _sanitize_text(text: str) -> str:
    return _ANSI_ESCAPE_PATTERN.sub("", text or "").strip()


def _escape_cell(text: str) -> str:
    return (text or "").replace("|", "/")


def _status_rank(status: str) -> int:
    if status == "failed":
        return 3
    if status == "passed":
        return 2
    return 1


def _normalize_status(raw_status: str) -> str:
    status = raw_status or "skipped"
    if status in ("expected", "passed", "flaky"):
        return "passed"
    if status in ("unexpected", "failed", "timedOut", "interrupted"):
        return "failed"
    return "skipped"


def _title_for(prefix: str, suite_title: str, spec_title: str) -> str:
    base = " > ".join(part for part in (prefix, suite_title, spec_title) if part)
    return base or spec_title or "(untitled test)"


def _extract_skip_reason(test_item: dict, last_result: dict) -> str:
    annotations = []
    annotations.extend(test_item.get("annotations", []) or [])
    annotations.extend(last_result.get("annotations", []) or [])
    for annotation in annotations:
        annotation_type = str(annotation.get("type", "")).lower()
        if annotation_type in ("skip", "fixme"):
            description = str(annotation.get("description", "")).strip()
            return description or f"{annotation_type} annotation"
    return ""


def _extract_error_message(last_result: dict) -> str:
    error = last_result.get("error") or {}
    message = error.get("message")
    if message:
        return _sanitize_text(str(message))
    errors = last_result.get("errors", []) or []
    if errors:
        first = errors[0] or {}
        if first.get("message"):
            return _sanitize_text(str(first.get("message")))
    return ""


def _extract_tests(playwright_results: dict) -> list[dict]:
    report = _load_report(playwright_results)
    tests: list[dict] = []

    def walk(suite: dict, prefix: str, inherited_file: str) -> None:
        suite_title = suite.get("title", "") or ""
        combined = " > ".join(part for part in (prefix, suite_title) if part)
        suite_file = suite.get("file") or inherited_file

        for spec in suite.get("specs", []) or []:
            spec_title = spec.get("title", "") or ""
            title = _title_for(prefix, suite_title, spec_title)
            file_path = spec.get("file") or suite_file or ""

            for test_item in spec.get("tests", []) or []:
                results = test_item.get("results", []) or []
                last = results[-1] if results else {}
                normalized = _normalize_status(
                    test_item.get("status") or last.get("status") or "skipped"
                )

                attachments: list[str] = []
                for result in results:
                    for attachment in result.get("attachments", []) or []:
                        path_value = attachment.get("path")
                        if path_value:
                            attachments.append(str(path_value))

                error_message = _extract_error_message(last)
                skip_reason = _extract_skip_reason(test_item, last)

                if normalized == "skipped" and not skip_reason:
                    if not results:
                        skip_reason = (
                            "No result entry in Playwright JSON; often caused by an upstream dependency/setup failure."
                        )
                    else:
                        skip_reason = "Skipped without explicit reason in Playwright JSON."

                tests.append(
                    {
                        "title": title,
                        "file": file_path,
                        "status": normalized,
                        "attachments": attachments,
                        "error_message": error_message,
                        "skip_reason": skip_reason,
                    }
                )

        for child in suite.get("suites", []) or []:
            walk(child, combined, suite_file)

    for suite in report.get("suites", []) or []:
        walk(suite, "", suite.get("file") or "")

    return tests


def _tm_ids_from_title(title: str) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for match in _TM_ID_PATTERN.findall(title or ""):
        scenario_id = match.strip("[]")
        if scenario_id and scenario_id not in seen:
            seen.add(scenario_id)
            ids.append(scenario_id)
    return ids


def _normalize_title(title: str) -> str:
    without_tm = _TM_ID_PATTERN.sub("", title or "")
    return " ".join(without_tm.strip().lower().split())


def _build_fallback_map() -> dict[str, list[str]]:
    fallback: dict[str, list[str]] = {}
    for row in _load_scenario_mapping():
        test_title = str(row.get("test_title", ""))
        ids = [str(sid) for sid in (row.get("scenario_ids") or []) if sid]
        key = _normalize_title(test_title)
        if key and ids:
            fallback[key] = ids
    return fallback


def _unblock_hint(test: dict) -> str:
    reason = str(test.get("skip_reason", "")).lower()
    if "missing .auth/" in reason or "credential" in reason:
        return "Provide required credentials in e2e/.env.e2e and regenerate .auth storage state."
    if "blocked by testability" in reason or "missing test data" in reason:
        return "Add stable selectors/fixtures described in the skip reason, then rerun."
    if "setup failure" in reason or "dependency/setup" in reason:
        return "Fix failing setup/auth project first, then rerun Playwright."
    if reason:
        return "Address the skip reason and rerun."
    return "Collect explicit skip annotation or preconditions, then rerun."


def _map_tests(all_tests: list[dict]) -> tuple[list[dict], list[dict], int]:
    fallback_map = _build_fallback_map()
    mapped: list[dict] = []
    unmapped: list[dict] = []
    tm_tagged_tests_found = 0

    for test in all_tests:
        title = str(test.get("title", ""))
        tm_ids = _tm_ids_from_title(title)
        mapped_ids = list(tm_ids)
        mapped_from = "tm-tag"

        if tm_ids:
            tm_tagged_tests_found += 1
        else:
            mapped_from = "fallback"
            mapped_ids = fallback_map.get(_normalize_title(title), [])

        row = {
            **test,
            "scenario_ids": mapped_ids,
            "mapped_from": mapped_from,
        }
        if mapped_ids:
            mapped.append(row)
        else:
            unmapped.append(row)

    return mapped, unmapped, tm_tagged_tests_found


def render_executed_test_run(selection_result: dict, playwright_results: dict) -> tuple[str, dict]:
    selected = selection_result.get("plan", []) or []
    blocked_planned = selection_result.get("blocked", []) or []
    all_tests = _extract_tests(playwright_results)
    mapped_tests, unmapped_tests, tm_tagged_tests_found = _map_tests(all_tests)

    raw_total = len(all_tests)
    raw_passed = sum(1 for test in all_tests if test.get("status") == "passed")
    raw_failed = sum(1 for test in all_tests if test.get("status") == "failed")
    raw_skipped = sum(1 for test in all_tests if test.get("status") == "skipped")

    mapped_scenario_status: dict[str, str] = {}
    for test in mapped_tests:
        status = str(test.get("status", "skipped"))
        for scenario_id in test.get("scenario_ids", []):
            current = mapped_scenario_status.get(scenario_id)
            if not current or _status_rank(status) > _status_rank(current):
                mapped_scenario_status[scenario_id] = status

    mapped_scenarios = len(mapped_scenario_status)
    mapped_passed = sum(
        1 for value in mapped_scenario_status.values() if value == "passed"
    )
    mapped_failed = sum(
        1 for value in mapped_scenario_status.values() if value == "failed"
    )
    mapped_skipped = sum(
        1 for value in mapped_scenario_status.values() if value == "skipped"
    )

    lines = [
        "# Executed QA Test Run",
        "",
        "## Summary",
        f"- Playwright tests executed: {raw_total}",
        f"- Passed: {raw_passed}",
        f"- Failed: {raw_failed}",
        f"- Skipped: {raw_skipped}",
        f"- Scenario-mapped tests: {len(mapped_tests)}",
        f"- Unmapped tests: {len(unmapped_tests)}",
        f"- Blocked selected scenarios: {len(blocked_planned)}",
        f"- Selected scenarios: {len(selected)}",
        f"- TM-tagged tests found: {tm_tagged_tests_found}",
        f"- Mapped scenarios: {mapped_scenarios}",
        f"- Passed mapped scenarios: {mapped_passed}",
        f"- Failed mapped scenarios: {mapped_failed}",
        f"- Skipped mapped scenarios: {mapped_skipped}",
        "",
        "## All Playwright Tests",
        "| Status | Test | File | Scenario IDs | Evidence |",
        "|---|---|---|---|---|",
    ]

    if all_tests:
        mapped_lookup = {
            (item.get("title"), item.get("file")): item for item in mapped_tests
        }
        for test in sorted(all_tests, key=lambda t: (t.get("file", ""), t.get("title", ""))):
            mapped_item = mapped_lookup.get((test.get("title"), test.get("file")))
            scenario_ids = mapped_item.get("scenario_ids", []) if mapped_item else []
            scenario_text = ", ".join(scenario_ids) if scenario_ids else "unmapped"
            evidence = ", ".join((test.get("attachments") or [])[:3]) or "-"
            lines.append(
                f"| {test.get('status')} | {_escape_cell(str(test.get('title', '')))} | "
                f"{_escape_cell(str(test.get('file', '')))} | {scenario_text} | "
                f"{_escape_cell(evidence)} |"
            )
    else:
        lines.append("| - | No Playwright tests were found in raw results | - | - | - |")

    lines.extend(["", "## Scenario-Mapped Results", "| Scenario | Test | Status | Evidence |", "|---|---|---|---|"])
    if mapped_tests:
        for test in sorted(mapped_tests, key=lambda t: (t.get("file", ""), t.get("title", ""))):
            scenarios = ", ".join(test.get("scenario_ids", []))
            evidence = ", ".join((test.get("attachments") or [])[:3]) or "-"
            lines.append(
                f"| {scenarios} | {_escape_cell(str(test.get('title', '')))} | "
                f"{test.get('status')} | {_escape_cell(evidence)} |"
            )
    else:
        lines.append("| - | No mapped tests in this run | - | - |")

    lines.extend(["", "## Failed Tests / Potential Bugs"])
    failed_tests = [test for test in all_tests if test.get("status") == "failed"]
    if failed_tests:
        mapped_lookup = {
            (item.get("title"), item.get("file")): item for item in mapped_tests
        }
        for test in failed_tests:
            mapped_item = mapped_lookup.get((test.get("title"), test.get("file")))
            scenario_text = ", ".join(mapped_item.get("scenario_ids", [])) if mapped_item else "unmapped"
            evidence = ", ".join((test.get("attachments") or [])[:3]) or "-"
            message = test.get("error_message") or "No error message captured in Playwright JSON."
            lines.append(f"- test: {test.get('title')}")
            lines.append(f"  file: {test.get('file')}")
            lines.append(f"  scenario_ids: {scenario_text}")
            lines.append(f"  error: {message}")
            lines.append(f"  evidence: {evidence}")
            lines.append("  status: Evidence Found - Needs Triage")
    else:
        lines.append("No failed Playwright tests in this run.")

    lines.extend(["", "## Skipped Tests"])
    skipped_tests = [test for test in all_tests if test.get("status") == "skipped"]
    if skipped_tests:
        for test in skipped_tests:
            reason = test.get("skip_reason") or "No skip reason available."
            lines.append(f"- title: {test.get('title')}")
            lines.append(f"  file: {test.get('file')}")
            lines.append(f"  reason: {reason}")
            lines.append(f"  needed_to_unblock: {_unblock_hint(test)}")
    else:
        lines.append("No skipped Playwright tests in this run.")

    lines.extend(["", "## Unmapped Tests"])
    if unmapped_tests:
        for test in sorted(unmapped_tests, key=lambda t: (t.get("file", ""), t.get("title", ""))):
            lines.append(
                f"- {test.get('status')} | {test.get('title')} | {test.get('file')}"
            )
            lines.append(
                "  recommendation: Add [TM-xxx] tag to this test title or update scenario_mapping.json."
            )
    else:
        lines.append("No unmapped tests.")

    lines.extend(["", "## Blocked Selected Scenarios"])
    if blocked_planned:
        for item in blocked_planned:
            lines.append(
                f"- {item.get('scenario_id')} {item.get('scenario')} - {item.get('blocker_reason') or 'blocked'}"
            )
    else:
        lines.append("No selected scenarios were blocked before execution.")

    lines.append("")

    summary = {
        "playwright_total": raw_total,
        "playwright_passed": raw_passed,
        "playwright_failed": raw_failed,
        "playwright_skipped": raw_skipped,
        "mapped_tests": len(mapped_tests),
        "unmapped_tests": len(unmapped_tests),
        "mapped_scenarios": mapped_scenarios,
        "mapped_passed": mapped_passed,
        "mapped_failed": mapped_failed,
        "mapped_skipped": mapped_skipped,
    }
    return "\n".join(lines), summary


def write_executed_test_run(selection_result: dict, playwright_results: dict) -> tuple[str, dict]:
    content, summary = render_executed_test_run(selection_result, playwright_results)
    path = _write("reports", "executed_test_run.md", content)
    return path, summary
