"""Phase 1: Minimal LangGraph workflow for the Fleet QA agent system.

This file is intentionally simple. Its only goal is to prove that LangGraph
is installed correctly and that a multi-node graph can run locally.

There is NO LLM call here yet. Each node just prints a message and records a
step in the shared state. Later phases will add real test-planning logic and
(optionally) LLM-powered nodes.
"""

# `TypedDict` lets us describe the shape of our graph state in a way LangGraph
# understands. `typing-extensions` provides it for older Python versions too.
from typing_extensions import TypedDict

# `StateGraph` is the core builder for a LangGraph workflow.
# `START` and `END` are special markers for the entry and exit points.
from langgraph.graph import StateGraph, START, END


# ---------------------------------------------------------------------------
# 1. Define the shared state
# ---------------------------------------------------------------------------
# Every node receives the current state and returns an updated state.
# Our state has two fields:
#   - module: which Fleet module we are testing (e.g. "documents")
#   - steps:  a running log of what each node did
class QAState(TypedDict):
    module: str
    steps: list[str]


# ---------------------------------------------------------------------------
# 2. Define the nodes
# ---------------------------------------------------------------------------
# A node is just a function: (state) -> partial/updated state.
# Here we return the full updated state for clarity (beginner-friendly).


def collect_context_node(state: QAState) -> QAState:
    """First node: pretend to gather context about the module under test."""
    print("[collect_context_node] running...")

    # Append a message describing what this node did.
    message = f"Collected context for module '{state['module']}'."
    updated_steps = state["steps"] + [message]

    # Return the updated state.
    return {"module": state["module"], "steps": updated_steps}


def plan_test_node(state: QAState) -> QAState:
    """Second node: pretend to create a test plan for the module."""
    print("[plan_test_node] running...")

    message = f"Planned tests for module '{state['module']}'."
    updated_steps = state["steps"] + [message]

    return {"module": state["module"], "steps": updated_steps}


def final_report_node(state: QAState) -> QAState:
    """Third node: pretend to produce the final QA report."""
    print("[final_report_node] running...")

    message = f"Generated final report for module '{state['module']}'."
    updated_steps = state["steps"] + [message]

    return {"module": state["module"], "steps": updated_steps}


# ---------------------------------------------------------------------------
# 3. Build the graph
# ---------------------------------------------------------------------------
def build_graph():
    """Wire the nodes together into a linear workflow and compile it.

    Flow:
        START -> collect_context_node -> plan_test_node -> final_report_node -> END
    """
    # Create a graph that operates on our QAState shape.
    graph = StateGraph(QAState)

    # Register each function as a named node in the graph.
    graph.add_node("collect_context_node", collect_context_node)
    graph.add_node("plan_test_node", plan_test_node)
    graph.add_node("final_report_node", final_report_node)

    # Connect the nodes in order using edges.
    graph.add_edge(START, "collect_context_node")
    graph.add_edge("collect_context_node", "plan_test_node")
    graph.add_edge("plan_test_node", "final_report_node")
    graph.add_edge("final_report_node", END)

    # `compile()` turns the definition into a runnable application.
    return graph.compile()


# ---------------------------------------------------------------------------
# 4. Run the graph when this file is executed directly
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app = build_graph()
    initial_state = {
        "module": "documents",
        "steps": [],
    }
    result = app.invoke(initial_state)
    print(result)
