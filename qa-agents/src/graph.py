"""LangGraph workflow that orchestrates the Fleet QA exploratory test agents.

Flow:
    START
      -> load_testing_principles
      -> collect_context
      -> plan_test
      -> auth_rbac_agent
      -> data_integrity_agent
      -> forms_validation_agent
      -> business_flow_agent
      -> ui_ux_agent
      -> cross_review
      -> consolidate_report
      -> generate_exploratory_session
      -> END

Each specialized agent node checks whether it was selected. If selected, it
calls the LLM with its system prompt + the repo context + the testing
principles + the session charter, then appends a structured report. If not
selected, it returns an empty update (no-op).

The LLM (model + API key) is configured purely from environment variables.
No API keys are hardcoded.
"""

import os

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, START, END

from prompts import (
    ORCHESTRATOR_PROMPT,
    AUTH_RBAC_AGENT_PROMPT,
    DATA_INTEGRITY_AGENT_PROMPT,
    FORMS_VALIDATION_AGENT_PROMPT,
    BUSINESS_FLOW_AGENT_PROMPT,
    UI_UX_AGENT_PROMPT,
    CROSS_REVIEW_PROMPT,
    CONSOLIDATOR_PROMPT,
)
from repo_context import collect_repo_context
from state import QAState
from principles_loader import (
    load_testing_principles,
    build_session_charter,
    PRINCIPLE_NAMES,
)
from qa_schema import (
    build_dry_run_response,
    build_dry_run_final_report,
)
from session_generator import build_manual_session, write_session
from module_discovery import discover_modules
from test_roles import create_test_roles
from test_matrix import build_test_matrix
from full_system_writer import (
    write_test_roles,
    write_test_matrix,
    write_full_system_report,
)
from playwright_runner import run_playwright_tests
from evidence_writer import write_evidence_report
from scenario_coverage import build_scenario_coverage
from coverage_writer import write_scenario_coverage_report
from scenario_execution_queue import build_execution_queue
from execution_queue_writer import write_execution_queue_reports
from execution_planner import build_execution_plan
from test_generation_planner import generate_or_select_playwright_tests
from executed_run_writer import write_executed_test_run


def is_dry_run() -> bool:
    """Return True when QA_DRY_RUN is enabled (no real OpenAI calls)."""
    return os.getenv("QA_DRY_RUN", "false").lower() == "true"


def _get_llm() -> ChatOpenAI:
    """Create a ChatOpenAI client from environment variables.

    Reads:
        OPENAI_MODEL   - the model name.
        OPENAI_API_KEY - the API key (read by langchain_openai automatically).

    Validates both before making any LLM call so failures are clear and we
    never send a placeholder key to the API. Temperature is 0 for deterministic
    output.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or api_key == "your_api_key_here":
        raise ValueError(
            "OPENAI_API_KEY is missing or still placeholder. Please set a real "
            "key in qa-agents/.env. Do not share it in chat."
        )

    model = os.environ.get("OPENAI_MODEL")
    if not model or model == "your_model_name_here":
        raise ValueError(
            "OPENAI_MODEL is missing. Please set a valid model name in "
            "qa-agents/.env."
        )

    # ChatOpenAI reads OPENAI_API_KEY from the environment automatically.
    return ChatOpenAI(model=model, temperature=0)


def _run_agent(
    system_prompt: str,
    module: str,
    repo_context: str,
    agent_label: str,
    testing_principles: str,
    session_charter: str,
) -> str:
    """Run an agent: either a structured mock (dry-run) or a real LLM call.

    Every agent receives the module, repo context, the canonical testing
    principles, and the session charter so it tests by principle rather than
    inventing findings.
    """
    # Dry-run short-circuit: never touch the network or the API key.
    if is_dry_run():
        return build_dry_run_response(agent_label, module)

    llm = _get_llm()
    user_message = (
        f"Target module: {module}\n\n"
        f"Session charter:\n{session_charter}\n\n"
        f"Fleet QA testing principles you MUST apply:\n\n{testing_principles}\n\n"
        f"Source code context from the Fleet repository:\n\n{repo_context}"
    )
    response = llm.invoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
    )
    # `response.content` holds the model's text answer.
    return str(response.content)


# ---------------------------------------------------------------------------
# Graph nodes
# ---------------------------------------------------------------------------
def load_testing_principles_node(state: QAState) -> dict:
    """Load the canonical testing principles and build the session charter."""
    print("[load_testing_principles] loading exploratory testing principles...")
    principles = load_testing_principles()
    charter = build_session_charter(state["module"])
    return {"testing_principles": principles, "session_charter": charter}


def collect_context_node(state: QAState) -> dict:
    """Read relevant files from the Fleet repo (read-only)."""
    print("[collect_context] reading repository files...")
    context = collect_repo_context(state["repo_path"], state["module"])
    return {"repo_context": context}


def plan_test_node(state: QAState) -> dict:
    """Use the orchestrator prompt to produce a short, risk-based test plan."""
    print("[plan_test] building risk-based test plan...")
    if is_dry_run():
        plan = (
            "DRY RUN MODE — No OpenAI API call was made.\n\n"
            f"Session charter: {state['session_charter']}\n\n"
            f"Risk-based plan for `{state['module']}`: prioritize RBAC/visibility, "
            "owner binding and reminder generation, file-upload validation, "
            "end-to-end ownership flows, then refresh/back UX."
        )
    else:
        plan = _run_agent(
            ORCHESTRATOR_PROMPT,
            state["module"],
            state["repo_context"],
            "orchestrator",
            state["testing_principles"],
            state["session_charter"],
        )
    # Store the plan as the first entry in agent_reports.
    return {"agent_reports": state["agent_reports"] + [f"## Test Plan\n\n{plan}"]}


def _agent_node(name: str, system_prompt: str):
    """Factory that builds a selectable agent node.

    The returned function checks whether `name` is in selected_agents. If so it
    runs the LLM (or structured mock) and appends a report; otherwise it returns
    an empty update.
    """

    def node(state: QAState) -> dict:
        if name not in state["selected_agents"]:
            print(f"[{name}] skipped (not selected)")
            return {}
        print(f"[{name}] running...")
        report = _run_agent(
            system_prompt,
            state["module"],
            state["repo_context"],
            name,
            state["testing_principles"],
            state["session_charter"],
        )
        return {"agent_reports": state["agent_reports"] + [report]}

    return node


def cross_review_node(state: QAState) -> dict:
    """Cross-check all agent reports for duplicates, contradictions, gaps."""
    print("[cross_review] reviewing agent reports...")
    if is_dry_run():
        note = (
            "## Cross-Review Notes\n\n"
            "DRY RUN MODE — No OpenAI API call was made. In a real run this step "
            "merges duplicate findings, flags likely false positives, and lists "
            "coverage gaps across all agent reports."
        )
        return {"agent_reports": state["agent_reports"] + [note]}
    combined = "\n\n".join(state["agent_reports"])
    llm = _get_llm()
    response = llm.invoke(
        [
            {"role": "system", "content": CROSS_REVIEW_PROMPT},
            {"role": "user", "content": f"Agent reports:\n\n{combined}"},
        ]
    )
    return {"agent_reports": state["agent_reports"] + [str(response.content)]}


def consolidate_report_node(state: QAState) -> dict:
    """Merge everything into a single final markdown report."""
    print("[consolidate_report] building final report...")
    if is_dry_run():
        final = build_dry_run_final_report(
            state["module"],
            state["selected_agents"],
            state["session_charter"],
        )
        return {
            "final_report": final,
            "principle_coverage": PRINCIPLE_NAMES,
        }
    combined = "\n\n".join(state["agent_reports"])
    llm = _get_llm()
    system_prompt = CONSOLIDATOR_PROMPT.replace("{module}", state["module"])
    user_message = (
        f"Session charter:\n{state['session_charter']}\n\n"
        f"Fleet QA testing principles applied:\n\n{state['testing_principles']}\n\n"
        f"All agent reports and notes:\n\n{combined}"
    )
    response = llm.invoke(
        [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]
    )
    return {
        "final_report": str(response.content),
        "principle_coverage": PRINCIPLE_NAMES,
    }


def generate_exploratory_session_node(state: QAState) -> dict:
    """Turn the exploratory findings into a manual session sheet and save it.

    Reuses the existing manual session generator. Deterministic; never calls
    OpenAI.
    """
    print("[generate_exploratory_session] building manual session sheet...")
    session_md = build_manual_session(
        state["module"],
        state["selected_agents"],
        state["session_charter"],
    )
    path = write_session(state["module"], session_md)
    return {"manual_session": session_md, "session_file_path": path}


# ---------------------------------------------------------------------------
# Graph builder
# ---------------------------------------------------------------------------
def build_graph():
    """Wire all nodes into the QA orchestration workflow and compile it."""
    graph = StateGraph(QAState)

    # Register nodes.
    graph.add_node("load_testing_principles", load_testing_principles_node)
    graph.add_node("collect_context", collect_context_node)
    graph.add_node("plan_test", plan_test_node)
    graph.add_node(
        "auth_rbac_agent", _agent_node("auth_rbac_agent", AUTH_RBAC_AGENT_PROMPT)
    )
    graph.add_node(
        "data_integrity_agent",
        _agent_node("data_integrity_agent", DATA_INTEGRITY_AGENT_PROMPT),
    )
    graph.add_node(
        "forms_validation_agent",
        _agent_node("forms_validation_agent", FORMS_VALIDATION_AGENT_PROMPT),
    )
    graph.add_node(
        "business_flow_agent",
        _agent_node("business_flow_agent", BUSINESS_FLOW_AGENT_PROMPT),
    )
    graph.add_node("ui_ux_agent", _agent_node("ui_ux_agent", UI_UX_AGENT_PROMPT))
    graph.add_node("cross_review", cross_review_node)
    graph.add_node("consolidate_report", consolidate_report_node)
    graph.add_node(
        "generate_exploratory_session", generate_exploratory_session_node
    )

    # Connect the nodes in a straight line.
    graph.add_edge(START, "load_testing_principles")
    graph.add_edge("load_testing_principles", "collect_context")
    graph.add_edge("collect_context", "plan_test")
    graph.add_edge("plan_test", "auth_rbac_agent")
    graph.add_edge("auth_rbac_agent", "data_integrity_agent")
    graph.add_edge("data_integrity_agent", "forms_validation_agent")
    graph.add_edge("forms_validation_agent", "business_flow_agent")
    graph.add_edge("business_flow_agent", "ui_ux_agent")
    graph.add_edge("ui_ux_agent", "cross_review")
    graph.add_edge("cross_review", "consolidate_report")
    graph.add_edge("consolidate_report", "generate_exploratory_session")
    graph.add_edge("generate_exploratory_session", END)

    return graph.compile()


# ===========================================================================
# Phase 6A: Full-system QA orchestration foundation
# ===========================================================================
def discover_system_modules_node(state: QAState) -> dict:
    """Scan the Fleet repo (read-only) and list the modules to test."""
    print("[discover_system_modules] scanning repo for modules...")
    modules = discover_modules(state["repo_path"])
    print(f"[discover_system_modules] found {len(modules)} modules")
    return {"discovered_modules": modules}


def create_test_roles_node(state: QAState) -> dict:
    """Build the test role/persona definitions used across the system."""
    print("[create_test_roles] building test personas...")
    roles = create_test_roles()
    print(f"[create_test_roles] created {len(roles)} personas")
    return {"test_roles": roles}


def build_test_matrix_node(state: QAState) -> dict:
    """Build the full-system exploratory test matrix from modules + roles."""
    print("[build_test_matrix] building test matrix...")
    matrix = build_test_matrix(state["discovered_modules"], state["test_roles"])
    print(f"[build_test_matrix] generated {len(matrix)} scenarios")
    return {"test_matrix": matrix}


def write_full_system_outputs_node(state: QAState) -> dict:
    """Write the roles, matrix, and consolidated full-system report to disk.

    Deterministic; never calls OpenAI; never confirms bugs.
    """
    print("[write_full_system_outputs] writing roles, matrix, and report...")
    write_test_roles(state["test_roles"])
    write_test_matrix(state["test_matrix"])
    report_path = write_full_system_report(state)
    report_md = ""
    try:
        with open(report_path, "r", encoding="utf-8") as handle:
            report_md = handle.read()
    except OSError:
        report_md = ""
    return {"full_system_report": report_md}


def execute_playwright_tests_node(state: QAState) -> dict:
    """Phase 7B: optionally run Playwright and write an evidence report.

    This node is opt-in. When ``state["execute_e2e"]`` is false it is a no-op so
    full-system QA behaves exactly as before. When true it runs the Playwright
    harness in ``qa-agents/e2e``, collects evidence, and renders the evidence
    report. It never crashes the graph: a blocked/error run is still reported.

    The test matrix rows act as the problem inventory (bug candidates). They are
    only promoted to 'Evidence Found - Needs Triage' when a failed test maps
    explicitly to them; nothing is auto-marked a Confirmed Bug.
    """
    if not state.get("execute_e2e"):
        print("[execute_playwright_tests] skipped (--execute-e2e not set)")
        return {}

    e2e_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "e2e")
    print(f"[execute_playwright_tests] running Playwright in {e2e_dir} ...")
    results = run_playwright_tests(e2e_dir)

    if results.get("executed"):
        print(
                "[execute_playwright_tests] "
                f"exit={results.get('exit_code')} "
                f"passed={results.get('passed')} "
                f"failed={results.get('failed')} "
                f"skipped={results.get('skipped')}"
        )
    else:
        print(
            "[execute_playwright_tests] BLOCKED: "
            f"{results.get('error') or results.get('reason')}"
        )

    problem_inventory = state.get("test_matrix", []) or []
    evidence_path = write_evidence_report(results, problem_inventory)
    print(f"[execute_playwright_tests] evidence report: {evidence_path}")

    evidence_md = ""
    try:
        with open(evidence_path, "r", encoding="utf-8") as handle:
            evidence_md = handle.read()
    except OSError:
        evidence_md = ""

    return {
        "playwright_results": results,
        "evidence_report": evidence_md,
        "evidence_report_path": evidence_path,
    }


def build_scenario_coverage_node(state: QAState) -> dict:
    """Phase 7D: derive per-scenario coverage from matrix + Playwright evidence."""
    print("[build_scenario_coverage] building scenario coverage...")
    coverage = build_scenario_coverage(
        state.get("test_matrix", []) or [],
        state.get("playwright_results", {}) or {},
    )
    print(f"[build_scenario_coverage] built {len(coverage)} coverage rows")
    return {"scenario_coverage": coverage}


def write_scenario_coverage_report_node(state: QAState) -> dict:
    """Phase 7D: write the scenario coverage markdown report."""
    print("[write_scenario_coverage_report] writing scenario coverage report...")
    report_path = write_scenario_coverage_report(
        state.get("scenario_coverage", []) or [],
        state.get("playwright_results", {}) or {},
    )
    print(f"[write_scenario_coverage_report] report: {report_path}")
    return {"scenario_coverage_report_path": report_path}


def build_execution_queue_node(state: QAState) -> dict:
    """Phase 8: classify every matrix scenario into an execution queue."""
    print("[build_execution_queue] classifying execution queue...")
    queue = build_execution_queue(
        state.get("test_matrix", []) or [],
        state.get("scenario_coverage", []) or [],
        state.get("test_roles", []) or [],
        state.get("playwright_results", {}) or {},
    )
    print(f"[build_execution_queue] built {len(queue)} queue rows")
    return {"execution_queue": queue}


def write_execution_queue_reports_node(state: QAState) -> dict:
    """Phase 8: write all execution queue markdown reports."""
    print("[write_execution_queue_reports] writing execution queue reports...")
    paths, consistency = write_execution_queue_reports(state.get("execution_queue", []) or [])
    print(
        "[write_execution_queue_reports] queue report: "
        f"{paths.get('scenario_execution_queue')}"
    )
    return {
        "execution_queue_report_paths": paths,
        "execution_queue_consistency": consistency,
    }


def execute_priority_planner_node(state: QAState) -> dict:
    """Phase 9: pick high-priority executable scenarios."""
    print("[execute_priority_planner] selecting execution-first scenarios...")

    queue = state.get("execution_queue", []) or []
    if not queue:
        # Rebuild from latest Playwright evidence if a queue is not already in state.
        raw_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            "evidence",
            "playwright_results.json",
        )
        playwright_context = (
            {"executed": True, "raw_results_path": raw_path}
            if os.path.isfile(raw_path)
            else {}
        )
        coverage = build_scenario_coverage(
            state.get("test_matrix", []) or [],
            playwright_context,
        )
        queue = build_execution_queue(
            state.get("test_matrix", []) or [],
            coverage,
            state.get("test_roles", []) or [],
            playwright_context,
        )

    plan = build_execution_plan(
        queue,
        state.get("test_matrix", []) or [],
        int(state.get("max_tests", 20) or 20),
    )
    print(f"[execute_priority_planner] selected {len(plan)} scenarios")
    return {"execution_queue": queue, "execution_plan": plan}


def generate_or_select_playwright_tests_node(state: QAState) -> dict:
    """Phase 9: generate runnable tests or mark blocked scenarios."""
    print("[generate_or_select_playwright_tests] preparing runnable tests...")
    e2e_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "e2e")
    result = generate_or_select_playwright_tests(
        state.get("execution_plan", []) or [],
        e2e_dir,
    )
    print(
        "[generate_or_select_playwright_tests] "
        f"runnable={len(result.get('runnable', []))} "
        f"blocked={len(result.get('blocked', []))} "
        f"generated_files={len(result.get('generated_files', []))}"
    )
    return {"test_generation_result": result}


def execute_priority_playwright_tests_node(state: QAState) -> dict:
    """Phase 9: execute Playwright for the selected/generated tests."""
    print("[execute_playwright_tests] running Playwright for execute-priority...")
    e2e_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "e2e")
    results = run_playwright_tests(e2e_dir)
    if results.get("executed"):
        print(
            "[execute_playwright_tests] "
            f"exit={results.get('exit_code')} "
            f"passed={results.get('passed')} "
            f"failed={results.get('failed')} "
            f"skipped={results.get('skipped')}"
        )
    else:
        print(
            "[execute_playwright_tests] BLOCKED: "
            f"{results.get('error') or results.get('reason')}"
        )
    return {"playwright_results": results}


def write_executed_test_run_node(state: QAState) -> dict:
    """Phase 9: write a run report based only on actually executed tests."""
    print("[write_executed_test_run] writing executed test run report...")
    report_path, summary = write_executed_test_run(
        state.get("test_generation_result", {}) or {},
        state.get("playwright_results", {}) or {},
    )
    print(f"[write_executed_test_run] report: {report_path}")
    return {
        "executed_test_run_path": report_path,
        "executed_test_run_summary": summary,
    }


def build_full_system_graph():
    """Wire the full-system foundation workflow and compile it.

    Flow:
        START
          -> load_testing_principles
          -> discover_system_modules
          -> create_test_roles
          -> build_test_matrix
          -> write_full_system_outputs
          -> execute_playwright_tests
                    -> build_scenario_coverage
                    -> write_scenario_coverage_report
                                        -> build_execution_queue
                                        -> write_execution_queue_reports
          -> END
    """
    graph = StateGraph(QAState)

    graph.add_node("load_testing_principles", load_testing_principles_node)
    graph.add_node("discover_system_modules", discover_system_modules_node)
    graph.add_node("create_test_roles", create_test_roles_node)
    graph.add_node("build_test_matrix", build_test_matrix_node)
    graph.add_node("write_full_system_outputs", write_full_system_outputs_node)
    graph.add_node("execute_playwright_tests", execute_playwright_tests_node)
    graph.add_node("build_scenario_coverage", build_scenario_coverage_node)
    graph.add_node(
        "write_scenario_coverage_report", write_scenario_coverage_report_node
    )
    graph.add_node("build_execution_queue", build_execution_queue_node)
    graph.add_node(
        "write_execution_queue_reports", write_execution_queue_reports_node
    )

    graph.add_edge(START, "load_testing_principles")
    graph.add_edge("load_testing_principles", "discover_system_modules")
    graph.add_edge("discover_system_modules", "create_test_roles")
    graph.add_edge("create_test_roles", "build_test_matrix")
    graph.add_edge("build_test_matrix", "write_full_system_outputs")
    graph.add_edge("write_full_system_outputs", "execute_playwright_tests")
    graph.add_edge("execute_playwright_tests", "build_scenario_coverage")
    graph.add_edge("build_scenario_coverage", "write_scenario_coverage_report")
    graph.add_edge("write_scenario_coverage_report", "build_execution_queue")
    graph.add_edge("build_execution_queue", "write_execution_queue_reports")
    graph.add_edge("write_execution_queue_reports", END)

    return graph.compile()


def build_execute_priority_graph():
    """Phase 9 execution-first workflow.

    Flow:
        load_testing_principles
        -> discover_system_modules
        -> create_test_roles
        -> build_test_matrix
        -> execute_priority_planner
        -> generate_or_select_playwright_tests
        -> execute_playwright_tests
        -> write_executed_test_run
        -> END
    """
    graph = StateGraph(QAState)

    graph.add_node("load_testing_principles", load_testing_principles_node)
    graph.add_node("discover_system_modules", discover_system_modules_node)
    graph.add_node("create_test_roles", create_test_roles_node)
    graph.add_node("build_test_matrix", build_test_matrix_node)
    graph.add_node("execute_priority_planner", execute_priority_planner_node)
    graph.add_node(
        "generate_or_select_playwright_tests",
        generate_or_select_playwright_tests_node,
    )
    graph.add_node("execute_playwright_tests", execute_priority_playwright_tests_node)
    graph.add_node("write_executed_test_run", write_executed_test_run_node)

    graph.add_edge(START, "load_testing_principles")
    graph.add_edge("load_testing_principles", "discover_system_modules")
    graph.add_edge("discover_system_modules", "create_test_roles")
    graph.add_edge("create_test_roles", "build_test_matrix")
    graph.add_edge("build_test_matrix", "execute_priority_planner")
    graph.add_edge("execute_priority_planner", "generate_or_select_playwright_tests")
    graph.add_edge("generate_or_select_playwright_tests", "execute_playwright_tests")
    graph.add_edge("execute_playwright_tests", "write_executed_test_run")
    graph.add_edge("write_executed_test_run", END)

    return graph.compile()
