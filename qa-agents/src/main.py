"""CLI entry point for the Fleet QA orchestration system.

Usage:
    python src/main.py --module documents --repo ..

This builds the LangGraph workflow, runs it for the chosen module, writes a
markdown report into the local `reports/` folder, and prints the report path.

The agents only READ the Fleet repo and PRODUCE a report. They never modify any
application code.
"""

import argparse
import os

# Load variables from a local .env file (if present) into the environment.
from dotenv import load_dotenv

from graph import build_graph, build_full_system_graph, build_execute_priority_graph
from report_writer import write_report
from scenario_coverage import summarize_playwright_results

# All agent names in run order. By default every agent is selected.
ALL_AGENTS = [
    "auth_rbac_agent",
    "data_integrity_agent",
    "forms_validation_agent",
    "business_flow_agent",
    "ui_ux_agent",
]


def parse_args() -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Run the Fleet QA exploratory testing orchestrator."
    )
    parser.add_argument(
        "--mode",
        choices=["module", "full", "execute-priority"],
        default=None,
        help=(
            "'module' tests one module; 'full' runs full-system orchestration "
            "across the whole Fleet ERP; 'execute-priority' runs execution-first "
            "browser testing from top-priority scenarios. If omitted, --module implies module mode."
        ),
    )
    parser.add_argument(
        "--module",
        required=False,
        help="Module to test (e.g. documents, auth, vehicles, dashboard).",
    )
    parser.add_argument(
        "--repo",
        default=os.environ.get("FLEET_REPO_PATH", ".."),
        help="Path to the Fleet repo root (default: .. or FLEET_REPO_PATH).",
    )
    parser.add_argument(
        "--agents",
        default=",".join(ALL_AGENTS),
        help="Comma-separated list of agents to run (default: all).",
    )
    parser.add_argument(
        "--execute-e2e",
        action="store_true",
        help=(
            "Opt-in: actually run the Playwright evidence harness in e2e/ during "
            "full-system mode and write reports/evidence_report.md. Requires the "
            "Fleet app running and e2e/.env.e2e configured. Off by default."
        ),
    )
    parser.add_argument(
        "--max-tests",
        type=int,
        default=20,
        help="Maximum scenarios to include in execute-priority mode (default: 20).",
    )
    return parser.parse_args()


def main() -> None:
    # Read .env so OPENAI_API_KEY / OPENAI_MODEL / FLEET_REPO_PATH are available.
    load_dotenv()

    args = parse_args()

    # Dry-run mode: no real OpenAI calls are made (deterministic mock output).
    dry_run = os.getenv("QA_DRY_RUN", "false").lower() == "true"
    if dry_run:
        print("Running in QA_DRY_RUN mode. No OpenAI API calls will be made.")
    elif not os.environ.get("OPENAI_API_KEY"):
        # Friendly guard: warn (do not crash) if the API key is missing.
        print(
            "WARNING: OPENAI_API_KEY is not set. Copy .env.example to .env and "
            "fill it in before running, otherwise the LLM calls will fail."
        )

    selected_agents = [a.strip() for a in args.agents.split(",") if a.strip()]

    # Resolve the run mode. --mode full wins; otherwise --module implies module
    # mode. If neither is provided, show a helpful error.
    if args.mode == "full":
        mode = "full"
    elif args.mode == "execute-priority":
        mode = "execute-priority"
    elif args.module:
        mode = "module"
    elif args.mode == "module":
        raise SystemExit(
            "--module is required when --mode is 'module'. Example:\n"
            "  python src/main.py --module documents --repo .."
        )
    else:
        raise SystemExit(
            "Nothing to run. Choose one of:\n"
            "  python src/main.py --module documents --repo ..   (single module)\n"
            "  python src/main.py --mode full --repo ..           (full system)"
        )

    module_label = args.module or "full_system"

    initial_state = {
        "module": module_label,
        "repo_path": args.repo,
        "selected_agents": selected_agents,
        "repo_context": "",
        "testing_principles": "",
        "session_charter": "",
        "principle_coverage": [],
        "agent_reports": [],
        "final_report": "",
        "manual_session": "",
        "session_file_path": "",
        "discovered_modules": [],
        "test_roles": [],
        "test_matrix": [],
        "full_system_report": "",
        "execute_e2e": bool(args.execute_e2e),
        "playwright_results": {},
        "evidence_report": "",
        "evidence_report_path": "",
        "scenario_coverage": [],
        "scenario_coverage_report_path": "",
        "execution_queue": [],
        "execution_queue_report_paths": {},
        "execution_queue_consistency": {},
        "max_tests": int(args.max_tests),
        "execution_plan": [],
        "test_generation_result": {},
        "executed_test_run_path": "",
        "executed_test_run_summary": {},
    }

    if mode == "full":
        print("Starting FULL-SYSTEM QA orchestration across the Fleet ERP...")
        app = build_full_system_graph()
        result = app.invoke(initial_state)

        print("\nDone.")
        print("Full-system foundation outputs written to:")
        print("  roles/test_roles.md")
        print("  matrix/fleet_test_matrix.md")
        print("  reports/full_system_qa_report.md")
        print(
            f"Discovered {len(result.get('discovered_modules', []))} modules, "
            f"{len(result.get('test_roles', []))} roles, "
            f"{len(result.get('test_matrix', []))} test scenarios."
        )
        coverage_items = result.get("scenario_coverage", []) or []
        coverage_report_path = result.get("scenario_coverage_report_path") or ""
        pw_summary = summarize_playwright_results(result.get("playwright_results", {}) or {})
        blocked = sum(
            1
            for item in coverage_items
            if item.get("execution_status") == "blocked"
        )
        not_run = sum(
            1
            for item in coverage_items
            if item.get("execution_status") in ("not_run", "manual_needed")
        )
        print("Scenario coverage:")
        print(f"- total: {len(coverage_items)}")
        print(f"- automated: {pw_summary.get('automated', 0)}")
        print(f"- passed: {pw_summary.get('passed', 0)}")
        print(f"- failed: {pw_summary.get('failed', 0)}")
        print(f"- skipped: {pw_summary.get('skipped', 0)}")
        print(f"- not_run: {not_run}")
        print(f"- blocked: {blocked}")
        if coverage_report_path:
            print("Report:")
            print("reports/scenario_coverage_report.md")
        queue = result.get("execution_queue", []) or []
        queue_consistency = result.get("execution_queue_consistency", {}) or {}
        print("Execution queue:")
        print(f"- total: {queue_consistency.get('total', len(queue))}")
        print(
            f"- automated_playwright: "
            f"{queue_consistency.get('automated_playwright', 0)}"
        )
        print(
            f"- automation_candidate: "
            f"{queue_consistency.get('automation_candidate', 0)}"
        )
        print(
            f"- manual_exploratory: "
            f"{queue_consistency.get('manual_exploratory', 0)}"
        )
        print(
            f"- blocked: "
            f"{queue_consistency.get('blocked', 0)}"
        )
        print(
            f"- not_ready: "
            f"{queue_consistency.get('not_ready', 0)}"
        )
        print(
            f"- passed: "
            f"{queue_consistency.get('passed', 0)}"
        )
        print(
            f"- failed: "
            f"{queue_consistency.get('failed', 0)}"
        )
        print(
            f"- skipped: "
            f"{queue_consistency.get('skipped', 0)}"
        )
        print(
            f"- consistency_valid: "
            f"{str(not queue_consistency.get('errors')).lower()}"
        )
        if args.execute_e2e:
            pw = result.get("playwright_results", {}) or {}
            if pw.get("executed"):
                print(
                    "Playwright evidence: "
                    f"exit={pw.get('exit_code')} "
                    f"passed={pw.get('passed')} "
                    f"failed={pw.get('failed')} "
                    f"skipped={pw.get('skipped')}"
                )
            else:
                print(
                    "Playwright evidence: BLOCKED - "
                    f"{pw.get('error') or pw.get('reason') or 'did not run'}"
                )
            evidence_path = result.get("evidence_report_path")
            if evidence_path:
                print(f"  reports/evidence_report.md ({evidence_path})")
                print("  evidence/playwright_results.json")
                print("  evidence/playwright_stderr.log")
        queue_paths = result.get("execution_queue_report_paths") or {}
        if queue_paths:
            print("Execution queue reports:")
            print("  reports/scenario_execution_queue.md")
            print("  reports/automation_candidates.md")
            print("  reports/manual_exploratory_queue.md")
            print("  reports/blocked_scenarios.md")
            print("  reports/queue_consistency_check.md")
        return

    if mode == "execute-priority":
        print("Starting EXECUTION-FIRST QA orchestration...")
        app = build_execute_priority_graph()
        result = app.invoke(initial_state)

        print("\nDone.")
        plan = result.get("execution_plan", []) or []
        selection = result.get("test_generation_result", {}) or {}
        runnable = selection.get("runnable", []) or []
        blocked = selection.get("blocked", []) or []
        pw = result.get("playwright_results", {}) or {}
        run_summary = result.get("executed_test_run_summary", {}) or {}

        print(f"Selected scenarios: {len(plan)} (max {args.max_tests})")
        print(f"Runnable scenarios: {len(runnable)}")
        print(f"Blocked scenarios: {len(blocked)}")
        if not pw.get("executed"):
            print(
                "Playwright summary: BLOCKED - "
                f"{pw.get('error') or pw.get('reason') or 'did not run'}"
            )
        else:
            print("Playwright tests:")
            print(f"- total: {run_summary.get('playwright_total', 0)}")
            print(f"- passed: {run_summary.get('playwright_passed', 0)}")
            print(f"- failed: {run_summary.get('playwright_failed', 0)}")
            print(f"- skipped: {run_summary.get('playwright_skipped', 0)}")
            print("Scenario mapping:")
            print(f"- mapped: {run_summary.get('mapped_tests', 0)}")
            print(f"- unmapped: {run_summary.get('unmapped_tests', 0)}")

        report_path = result.get("executed_test_run_path")
        if report_path:
            print("Executed run report:")
            print("reports/executed_test_run.md")
        return

    print(f"Starting QA orchestration for module '{module_label}'...")
    app = build_graph()
    result = app.invoke(initial_state)

    final_report = result.get("final_report") or "No final report was produced."
    report_path = write_report(module_label, final_report)

    # The latest file lives alongside the timestamped one in reports/.
    latest_path = os.path.join(
        os.path.dirname(report_path), f"latest_{module_label}_qa_report.md"
    )

    print("\nDone.")
    print(f"History report written to: {report_path}")
    print(f"Latest report updated at:  {latest_path}")
    session_path = result.get("session_file_path")
    if session_path:
        print(f"Manual session written to: {session_path}")


if __name__ == "__main__":
    main()
