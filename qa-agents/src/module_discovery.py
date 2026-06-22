"""Read-only Fleet module discovery for full-system QA.

Scans the Fleet repo (skipping dependencies/build artifacts) and discovers the
likely application modules by matching keywords against relative file paths.
This NEVER writes to the Fleet app — it only inspects paths.

Each discovered module is returned as a dict with:
    module, matched_files, file_count, risk_level, risk_reason
"""

from __future__ import annotations

import os

# Directories we never scan (dependencies and build artifacts).
IGNORED_DIRS = {
    "node_modules",
    ".next",
    ".git",
    "dist",
    "build",
    ".venv",
    "__pycache__",
}

# File types worth counting as evidence that a module exists.
ALLOWED_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".prisma"}

# Module -> keyword list used to match against relative file paths.
MODULE_KEYWORDS: dict[str, list[str]] = {
    "auth": ["auth", "login", "session", "middleware", "role", "user"],
    "dashboard": ["dashboard", "kpi", "revenue", "forecast"],
    "drivers": ["driver", "drivers"],
    "vehicles": ["vehicle", "vehicles"],
    "companies": ["company", "companies"],
    "documents": ["document", "documents", "upload", "expiry", "reminder"],
    "reminders": ["reminder", "reminders", "cron", "notification"],
    "einsatzplan": [
        "einsatz",
        "assignment",
        "calendar",
        "schedule",
        "transport",
    ],
    "urlaubsplaner": ["urlaub", "vacation", "leave", "absence"],
    "requests": ["request", "requests", "sick", "absence", "kt", "ut"],
    "handovers": ["handover", "vehicle handover"],
    "accidents": ["accident", "damage", "cargo"],
    "notifications": ["notification", "notifications"],
    "global_search": ["search", "global search"],
    "export": ["export", "excel", "xlsx", "report"],
    "user_management": ["user", "users", "permissions", "role"],
}

# Risk level per module (with a short human-readable reason).
_CRITICAL = {"auth", "user_management"}
_HIGH = {
    "documents",
    "einsatzplan",
    "requests",
    "export",
    "reminders",
    "drivers",
    "vehicles",
    "companies",
    "accidents",
    "handovers",
}
_MEDIUM = {"dashboard", "notifications", "global_search"}

_RISK_REASONS: dict[str, str] = {
    "auth": "Controls authentication, sessions, and access — a breach exposes everything.",
    "user_management": "Manages users, roles, and permissions across tenants.",
    "documents": "Holds private/compliance documents; leakage is a privacy risk.",
    "einsatzplan": "Drives assignments/scheduling; errors cause operational failures.",
    "requests": "Leave/absence flows feed the calendar and approvals.",
    "export": "Exports/reports can leak finance or cross-tenant data.",
    "reminders": "Compliance reminders must fire correctly to avoid legal exposure.",
    "drivers": "Core operational data; integrity and ownership matter.",
    "vehicles": "Core fleet data tied to assignments and compliance.",
    "companies": "Tenant boundary; isolation failures are critical.",
    "accidents": "Damage/accident records carry compliance and liability weight.",
    "handovers": "Vehicle handover records affect responsibility tracking.",
    "dashboard": "Aggregates finance/operational KPIs; visibility must respect roles.",
    "notifications": "Delivery reliability affects compliance and workflows.",
    "global_search": "Search can surface records a role should not see.",
}


def _risk_for(module: str) -> str:
    """Return the risk level string for a module."""
    if module in _CRITICAL:
        return "Critical"
    if module in _HIGH:
        return "High"
    if module in _MEDIUM:
        return "Medium"
    return "Low"


def discover_modules(repo_path: str, max_files_per_module: int = 8) -> list[dict]:
    """Scan the repo and return a list of discovered-module dicts.

    Modules with zero matches are still returned (file_count 0) so the matrix
    can flag them for manual confirmation.
    """
    matched: dict[str, list[str]] = {name: [] for name in MODULE_KEYWORDS}

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for filename in files:
            _, ext = os.path.splitext(filename)
            if ext.lower() not in ALLOWED_EXTENSIONS:
                continue
            full_path = os.path.join(root, filename)
            rel = os.path.relpath(full_path, repo_path)
            rel_lower = rel.lower()
            for name, keywords in MODULE_KEYWORDS.items():
                if len(matched[name]) >= max_files_per_module:
                    continue
                if any(kw in rel_lower for kw in keywords):
                    matched[name].append(rel)

    discovered: list[dict] = []
    for name in MODULE_KEYWORDS:
        files_for_module = matched[name]
        discovered.append(
            {
                "module": name,
                "matched_files": files_for_module,
                "file_count": len(files_for_module),
                "risk_level": _risk_for(name),
                "risk_reason": _RISK_REASONS.get(
                    name, "General module; standard exploratory coverage applies."
                ),
            }
        )
    return discovered
