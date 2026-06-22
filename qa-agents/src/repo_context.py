"""Read-only repository context collector.

This module scans the Fleet repo and gathers relevant source files for a given
module so the QA agents have real code to reason about.

IMPORTANT: This module only READS files. It never writes or edits anything in
the Fleet application.
"""

import os

# Directories we never want to scan (dependencies and build artifacts).
IGNORED_DIRS = {"node_modules", ".next", ".git", "dist", "build", ".venv"}

# Only these file types are considered useful source/context for testing.
ALLOWED_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".prisma", ".md"}

# Maximum number of characters we keep from any single file.
MAX_CHARS_PER_FILE = 6000

# Map each module name to the keywords used to find its relevant files.
# A file is considered relevant if any keyword appears in its path/filename.
MODULE_KEYWORDS: dict[str, list[str]] = {
    "auth": ["auth", "login", "session", "middleware", "role", "user"],
    "drivers": ["driver", "drivers"],
    "vehicles": ["vehicle", "vehicles"],
    "documents": ["document", "documents", "upload", "expiry", "reminder"],
    "einsatzplan": ["einsatz", "assignment", "calendar", "schedule", "transport"],
    "requests": ["request", "leave", "urlaub", "sick", "absence"],
    "export": ["export", "excel", "xlsx", "report"],
    "dashboard": ["dashboard", "kpi", "revenue", "forecast"],
}


def collect_repo_context(repo_path: str, module: str, max_files: int = 20) -> str:
    """Scan the Fleet repo and return combined text content for a module.

    Args:
        repo_path: Path to the Fleet repository root.
        module:    Module name (must be a key in MODULE_KEYWORDS).
        max_files: Maximum number of files to include in the context.

    Returns:
        A single string with each selected file's name followed by its
        (truncated) content. Returns a helpful message if nothing is found.
    """
    # Look up the keywords for the requested module. Fall back to the module
    # name itself if the module is not in our mapping.
    keywords = MODULE_KEYWORDS.get(module.lower(), [module.lower()])

    matched_files: list[str] = []

    # Walk the repository tree top-down so we can prune ignored directories.
    for root, dirs, files in os.walk(repo_path):
        # Mutating `dirs` in place tells os.walk to skip these folders.
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]

        for filename in files:
            # Skip files with extensions we don't care about.
            _, ext = os.path.splitext(filename)
            if ext.lower() not in ALLOWED_EXTENSIONS:
                continue

            full_path = os.path.join(root, filename)

            # Match by keyword against the lowercased relative path so that
            # both folder names and file names can match.
            relative_path = os.path.relpath(full_path, repo_path).lower()
            if any(keyword in relative_path for keyword in keywords):
                matched_files.append(full_path)

            # Stop early once we have enough files.
            if len(matched_files) >= max_files:
                break
        if len(matched_files) >= max_files:
            break

    if not matched_files:
        return (
            f"No matching files found for module '{module}' under '{repo_path}'.\n"
            f"Keywords tried: {', '.join(keywords)}."
        )

    # Build the combined context string.
    chunks: list[str] = []
    for path in matched_files:
        relative_path = os.path.relpath(path, repo_path)
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as handle:
                content = handle.read(MAX_CHARS_PER_FILE)
        except OSError as error:
            content = f"<could not read file: {error}>"

        chunks.append(f"===== FILE: {relative_path} =====\n{content}\n")

    header = (
        f"Collected {len(matched_files)} file(s) for module '{module}'.\n"
        f"(Each file truncated to {MAX_CHARS_PER_FILE} characters.)\n\n"
    )
    return header + "\n".join(chunks)
