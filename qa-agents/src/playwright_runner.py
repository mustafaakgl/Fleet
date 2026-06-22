"""Phase 7B: run the Playwright evidence harness and capture its output.

This module shells out to the Playwright project that lives in ``qa-agents/e2e``
and collects the raw JSON results plus stderr as evidence. It NEVER touches the
Fleet application code, NEVER hardcodes credentials (those come from
``e2e/.env.e2e``), and NEVER crashes the LangGraph workflow: every failure mode
returns a structured "blocked/error" dict instead of raising.

Output files (written under ``qa-agents/``):
    evidence/playwright_results.json   - raw Playwright JSON reporter output.
    evidence/playwright_stderr.log     - captured stderr from the run.
"""

from __future__ import annotations

import json
import os
import subprocess

from dotenv import dotenv_values

# qa-agents/ root (parent of src/).
_ROOT = os.path.dirname(os.path.dirname(__file__))
_EVIDENCE_DIR = os.path.join(_ROOT, "evidence")
_E2E_ENV_PATH = os.path.join(_ROOT, "e2e", ".env.e2e")

# Playwright is invoked via npx. Node 22 lives in a homebrew keg on macOS, so we
# extend PATH for the subprocess without mutating the parent environment.
_NODE_BIN = "/opt/homebrew/opt/node@22/bin"
_E2E_ENV_KEYS = (
    "BASE_URL",
    "ADMIN_EMAIL",
    "ADMIN_PASSWORD",
    "BOSS_EMAIL",
    "BOSS_PASSWORD",
    "ACCOUNTING_EMAIL",
    "ACCOUNTING_PASSWORD",
    "OFFICE_EMAIL",
    "OFFICE_PASSWORD",
    "DRIVER_EMAIL",
    "DRIVER_PASSWORD",
    "PRIVATE_DOCUMENT_SELECTOR",
    "PRIVATE_DOCUMENT_TEXT",
    "TEST_TENANT_B_DOCUMENT_ID",
    "DOCUMENT_DETAIL_ROUTE_TEMPLATE",
)


def _evidence_path(filename: str) -> str:
    """Return the absolute path for an evidence file (folder is created)."""
    os.makedirs(_EVIDENCE_DIR, exist_ok=True)
    return os.path.join(_EVIDENCE_DIR, filename)


def _subprocess_env() -> dict:
    """Build an env for the subprocess with Node 22 and e2e-local env only.

    Playwright credentials must come from ``e2e/.env.e2e`` only. We therefore
    clear any inherited e2e credential keys from the parent process before
    applying values from the local e2e env file.
    """
    env = os.environ.copy()
    if os.path.isdir(_NODE_BIN):
        env["PATH"] = f"{_NODE_BIN}:{env.get('PATH', '')}"

    for key in _E2E_ENV_KEYS:
        env.pop(key, None)

    if os.path.isfile(_E2E_ENV_PATH):
        for key, value in dotenv_values(_E2E_ENV_PATH).items():
            if key in _E2E_ENV_KEYS and value is not None:
                env[key] = value

    return env


def _count_outcomes(report: dict) -> tuple[int, int, int]:
    """Count passed/failed/skipped specs from a Playwright JSON report.

    The Playwright JSON reporter nests suites -> specs -> tests -> results.
    We walk the tree defensively because the shape can vary between versions
    and partial/failed runs may produce incomplete reports.
    """
    passed = failed = skipped = 0

    def walk_suite(suite: dict) -> None:
        nonlocal passed, failed, skipped
        for spec in suite.get("specs", []) or []:
            for test in spec.get("tests", []) or []:
                # Prefer the explicit per-test status when present.
                status = test.get("status")
                results = test.get("results", []) or []
                last = results[-1] if results else {}
                outcome = status or last.get("status")
                if outcome in ("skipped",):
                    skipped += 1
                elif outcome in ("expected", "passed"):
                    passed += 1
                elif outcome in ("unexpected", "failed", "timedOut", "interrupted"):
                    failed += 1
                elif outcome == "flaky":
                    passed += 1
                else:
                    # Unknown/empty outcome — treat as skipped (not a bug).
                    skipped += 1
        for child in suite.get("suites", []) or []:
            walk_suite(child)

    for suite in report.get("suites", []) or []:
        walk_suite(suite)

    return passed, failed, skipped


def run_playwright_tests(e2e_dir: str) -> dict:
    """Run the Playwright suite in ``e2e_dir`` and return a structured result.

    Args:
        e2e_dir: Path to the Playwright project (``qa-agents/e2e``).

    Returns:
        On a successful invocation (regardless of test pass/fail)::

            {
                "executed": True,
                "exit_code": int,
                "passed": int,
                "failed": int,
                "skipped": int,
                "raw_results_path": str,
                "stderr_path": str,
                "error": None,
            }

        If Playwright could not be invoked at all::

            {
                "executed": False,
                "error": "...",
                "reason": "Playwright could not run or app may not be available",
            }
    """
    e2e_dir = os.path.abspath(e2e_dir)
    raw_results_path = _evidence_path("playwright_results.json")
    stderr_path = _evidence_path("playwright_stderr.log")

    if not os.path.isdir(e2e_dir):
        return {
            "executed": False,
            "error": f"e2e directory not found: {e2e_dir}",
            "reason": "Playwright could not run or app may not be available",
        }

    command = ["npx", "playwright", "test", "--reporter=json"]

    try:
        completed = subprocess.run(
            command,
            cwd=e2e_dir,
            env=_subprocess_env(),
            capture_output=True,
            text=True,
            timeout=900,  # 15 min safety cap.
            check=False,
        )
    except FileNotFoundError as exc:
        # npx / node not on PATH.
        return {
            "executed": False,
            "error": f"Could not launch Playwright (npx not found): {exc}",
            "reason": "Playwright could not run or app may not be available",
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "executed": False,
            "error": f"Playwright run timed out after {exc.timeout}s",
            "reason": "Playwright could not run or app may not be available",
        }
    except OSError as exc:
        return {
            "executed": False,
            "error": f"OS error launching Playwright: {exc}",
            "reason": "Playwright could not run or app may not be available",
        }

    stdout = completed.stdout or ""
    stderr = completed.stderr or ""

    # Persist raw stdout (JSON) and stderr as evidence, even if parsing fails.
    try:
        with open(raw_results_path, "w", encoding="utf-8") as handle:
            handle.write(stdout)
        with open(stderr_path, "w", encoding="utf-8") as handle:
            handle.write(stderr)
    except OSError as exc:
        return {
            "executed": False,
            "error": f"Could not write evidence files: {exc}",
            "reason": "Playwright could not run or app may not be available",
        }

    # Parse the JSON reporter output to count outcomes. A non-JSON stdout means
    # Playwright failed before producing a report (e.g. config/install error).
    passed = failed = skipped = 0
    parse_error = None
    try:
        report = json.loads(stdout) if stdout.strip() else {}
        passed, failed, skipped = _count_outcomes(report)
    except (json.JSONDecodeError, ValueError) as exc:
        parse_error = str(exc)

    if parse_error and completed.returncode != 0 and (passed + failed + skipped) == 0:
        # Could not parse and the process failed: treat as a blocked run so we
        # never invent passes/fails without evidence.
        return {
            "executed": False,
            "error": (
                "Playwright did not produce a parseable JSON report "
                f"(exit code {completed.returncode}): {parse_error}. "
                "See evidence/playwright_stderr.log."
            ),
            "reason": "Playwright could not run or app may not be available",
        }

    return {
        "executed": True,
        "exit_code": completed.returncode,
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "raw_results_path": raw_results_path,
        "stderr_path": stderr_path,
        "error": None,
    }
