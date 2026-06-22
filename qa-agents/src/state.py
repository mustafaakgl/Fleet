"""Shared state definition for the QA orchestration graph.

The state is a single dictionary that flows through every node in the graph.
Each node reads from it and returns a partial update that LangGraph merges back
into the state.
"""

from typing_extensions import TypedDict


class QAState(TypedDict):
    """The shared state passed between all graph nodes.

    Fields:
        module:             Which Fleet module we are testing (e.g. "documents").
        repo_path:          Filesystem path to the Fleet repo root to read from.
        selected_agents:    Names of the agents that should actually run.
        repo_context:       Combined source code/text collected from the repo.
        testing_principles: The canonical exploratory testing principles text.
        session_charter:    The charter that frames this testing session.
        principle_coverage: Which testing principles were applied/covered.
        agent_reports:      One markdown report string per agent that ran.
        final_report:       The consolidated markdown report.
        manual_session:     The generated manual exploratory session markdown.
        session_file_path:  Path to the written manual session sheet.

    Full-system (Phase 6) fields:
        discovered_modules: Modules discovered by scanning the repo.
        test_roles:         Role/persona definitions used for testing.
        test_matrix:        Full-system exploratory test matrix rows.
        full_system_report: The consolidated full-system markdown report.

    Playwright evidence (Phase 7B) fields:
        execute_e2e:          Opt-in flag to actually run Playwright tests.
        playwright_results:   Structured result dict from the Playwright run.
        evidence_report:      The rendered evidence report markdown.
        evidence_report_path: Path to the written evidence report.

    Scenario coverage (Phase 7D) fields:
        scenario_coverage:             Per-scenario coverage rows derived from
                                       the matrix + Playwright evidence.
        scenario_coverage_report_path: Path to the written scenario coverage
                                       markdown report.

    Scenario execution queue (Phase 8) fields:
        execution_queue:              Per-scenario execution queue rows that
                                      classify automation, manual work,
                                      blockers, and not-ready coverage.
        execution_queue_report_paths: Paths to the written execution queue
                                      markdown reports.
        execution_queue_consistency:  Validation summary derived only from the
                                      final execution queue rows.

    Execution-first (Phase 9) fields:
        max_tests:               Max scenarios to include in execute-priority.
        execution_plan:          Selected priority scenarios for real execution.
        test_generation_result:  Generated/runnable/blocked test-selection result.
        executed_test_run_path:  Path to reports/executed_test_run.md.
        executed_test_run_summary: Summary metrics for raw Playwright and
                                   scenario mapping output.
    """

    module: str
    repo_path: str
    selected_agents: list[str]
    repo_context: str
    testing_principles: str
    session_charter: str
    principle_coverage: list[str]
    agent_reports: list[str]
    final_report: str
    manual_session: str
    session_file_path: str

    # Full-system (Phase 6) fields.
    discovered_modules: list[dict]
    test_roles: list[dict]
    test_matrix: list[dict]
    full_system_report: str

    # Playwright evidence (Phase 7B) fields.
    execute_e2e: bool
    playwright_results: dict
    evidence_report: str
    evidence_report_path: str

    # Scenario coverage (Phase 7D) fields.
    scenario_coverage: list[dict]
    scenario_coverage_report_path: str

    # Scenario execution queue (Phase 8) fields.
    execution_queue: list[dict]
    execution_queue_report_paths: dict
    execution_queue_consistency: dict

    # Execution-first (Phase 9) fields.
    max_tests: int
    execution_plan: list[dict]
    test_generation_result: dict
    executed_test_run_path: str
    executed_test_run_summary: dict
