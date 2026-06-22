"""Loader for the canonical Fleet QA testing principles.

The principles live in `knowledge/testing_principles.md` so they can be read by
humans and injected into every agent prompt. This module reads that file and
exposes small helpers for the graph:

- `load_testing_principles()` returns the full markdown text.
- `PRINCIPLE_NAMES` is the canonical, ordered list of principle names.
- `build_session_charter(module)` produces a short charter for a module.

Nothing here calls OpenAI.
"""

from __future__ import annotations

import os

# The principles file sits in qa-agents/knowledge/, i.e. one level up from src/.
_KNOWLEDGE_DIR = os.path.join(os.path.dirname(__file__), "..", "knowledge")
_PRINCIPLES_PATH = os.path.join(_KNOWLEDGE_DIR, "testing_principles.md")

# Canonical, ordered principle names. Kept in sync with the markdown headings so
# agents and the final report can reference them consistently.
PRINCIPLE_NAMES: list[str] = [
    "Risk-Based Testing",
    "Charter-Based Exploratory Testing",
    "Happy Path + Sad Path",
    "Role-Based Testing",
    "Boundary and Edge Case Testing",
    "Data Integrity",
    "Cross-Module Effects",
    "Evidence-Based Bug Reporting",
    "Reproducibility",
    "Regression Thinking",
]

# Fallback text used only if the markdown file cannot be read for some reason.
_FALLBACK = (
    "# Fleet QA Testing Principles\n\n"
    "(testing_principles.md could not be read — using principle names only)\n\n"
    + "\n".join(f"{i + 1}. {name}" for i, name in enumerate(PRINCIPLE_NAMES))
)


def load_testing_principles() -> str:
    """Read and return the testing principles markdown text (read-only)."""
    try:
        with open(_PRINCIPLES_PATH, "r", encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return _FALLBACK


def build_session_charter(module: str) -> str:
    """Build a short charter-based exploratory testing charter for a module."""
    return (
        f"Explore the `{module}` module to surface the highest-risk defects "
        "(unauthorized access, finance/data leakage, data loss, wrong owner or "
        "assignment, missed compliance reminders, inconsistent export/calendar). "
        "Test across roles (admin/boss/accounting/office/driver), cover happy and "
        "sad paths, and capture evidence. A finding only counts as a confirmed "
        "bug when there is evidence; otherwise classify it as a Bug Candidate, "
        "Risk, Test Idea, UX Issue, or Question."
    )
