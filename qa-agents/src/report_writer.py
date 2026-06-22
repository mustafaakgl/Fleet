"""Helper for saving QA reports to disk.

Reports are written as timestamped markdown files inside the local `reports/`
folder so each test run is preserved.
"""

import os
from datetime import datetime


def write_report(module: str, content: str) -> str:
    """Save a markdown report and return the timestamped file path.

    Two files are written for every run:
      1. A timestamped file that preserves history and is never overwritten,
         e.g. ``report_documents_2026-06-22_141530.md``.
      2. A per-module "latest" file that is always overwritten with the newest
         report, e.g. ``latest_documents_qa_report.md``.

    Args:
        module:  The module the report is about (used in the filename).
        content: The markdown report content.

    Returns:
        The path to the timestamped report file (the history copy).
    """
    # The reports folder lives next to the `src/` folder, at qa-agents/reports.
    reports_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")

    # Create the folder if it does not exist yet.
    os.makedirs(reports_dir, exist_ok=True)

    # 1. Timestamped history file (never overwritten).
    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    timestamped_filename = f"report_{module}_{timestamp}.md"
    timestamped_path = os.path.join(reports_dir, timestamped_filename)
    with open(timestamped_path, "w", encoding="utf-8") as handle:
        handle.write(content)

    # 2. Per-module "latest" file (always overwritten with the newest report).
    latest_filename = f"latest_{module}_qa_report.md"
    latest_path = os.path.join(reports_dir, latest_filename)
    with open(latest_path, "w", encoding="utf-8") as handle:
        handle.write(content)

    return timestamped_path
