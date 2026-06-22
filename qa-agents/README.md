# qa-agents

A **separate**, self-contained LangGraph-based QA agent system for the Fleet ERP
project. It lives entirely inside this `qa-agents/` folder and does **not**
modify or depend on the existing Fleet application code (no `package.json`,
`app/`, `components/`, `prisma/`, etc. are touched).

> ⚠️ **The agents only READ the Fleet repo and GENERATE reports. They never
> modify, refactor, or write any application code.** Every bug they report
> includes reproducible steps.

## 🔐 Security rules (read first)

- **Do NOT commit `.env`.** It holds your secret API key and is git-ignored.
- **Do NOT paste API keys into chat** or share them with anyone. If a key is
  ever exposed, revoke it immediately and create a new one.
- The code **never prints the full API key** — `check_env.py` only shows the
  first 8 characters so you can confirm it loaded.
- Before any LLM call the code validates `OPENAI_API_KEY` and `OPENAI_MODEL`
  and raises a clear error if they are missing or still placeholders.

## What this folder is for

This is a Python + [LangGraph](https://langchain-ai.github.io/langgraph/)
orchestration system that coordinates multiple QA **exploratory-testing** agents
(Auth/RBAC, Data Integrity, Forms/Validation, Business Flow, UI/UX). For a
selected Fleet module, it:

1. Loads the canonical **testing principles** and builds a **session charter**.
2. Reads the relevant source files from the Fleet repo (read-only).
3. Runs each selected agent against that context using an LLM (or a structured
   dry-run mock).
4. Cross-reviews the findings.
5. Consolidates everything into one markdown report saved in `reports/`.

## This is principles-based exploratory testing — not random bug generation

The goal of this system is **not** to invent bug reports. It performs structured,
**evidence-based exploratory testing** driven by risk. Every agent:

- Loads and applies the canonical principles in
  [knowledge/testing_principles.md](knowledge/testing_principles.md) (risk-based,
  charter-based, role-based, boundary, data integrity, cross-module,
  evidence-based, reproducibility, regression thinking).
- Starts from a **session charter** (what we test, which risk, which role, what
  evidence, what counts as a bug).
- Produces **exploratory test ideas**, and separates findings into honest
  categories: **Confirmed Bug**, **Bug Candidate**, **Risk**, **Test Idea**,
  **UX Issue**, **Question**.
- Never reports a Confirmed Bug without evidence. In **dry-run** mode nothing is
  confirmed — every item is marked `DRY RUN - NEEDS MANUAL VERIFICATION`, and the
  report acts as a structured exploratory testing plan.

The final report includes a **Testing Principles Applied** table showing which
principle was covered and where.

## Honest coverage model

The full-system run currently generates 168 exploratory scenarios, but that does
**not** mean 168 scenarios were automatically executed.

- Only scenarios explicitly mapped to real Playwright tests can become
  `automated_playwright` coverage.
- Many scenarios still belong in `manual_exploratory`, `blocked`,
  `not_ready`, or `automation_candidate` buckets.
- The execution queue reports make that separation explicit so the system never
  over-claims automated coverage and never marks a bug confirmed without
  evidence.

After a full run, inspect these reports together:

- [reports/scenario_coverage_report.md](reports/scenario_coverage_report.md)
- [reports/scenario_execution_queue.md](reports/scenario_execution_queue.md)
- [reports/automation_candidates.md](reports/automation_candidates.md)
- [reports/manual_exploratory_queue.md](reports/manual_exploratory_queue.md)
- [reports/blocked_scenarios.md](reports/blocked_scenarios.md)

## Project structure

```
qa-agents/
  .env.example          # Template for environment variables (copy to .env)
  .gitignore            # Ignores .venv, .env, generated reports, caches
  requirements.txt      # Python dependencies
  README.md             # This file
  knowledge/
    testing_principles.md  # Canonical Fleet QA testing principles
  reports/              # Generated markdown reports land here
  src/
    main.py             # CLI entry point (build graph, run, write report)
    graph.py            # LangGraph workflow + LLM-powered agent nodes
    state.py            # QAState TypedDict (shared state shape)
    prompts.py          # System prompts for every agent + Fleet business rules
    principles_loader.py   # Reads testing_principles.md, builds the charter
    qa_schema.py        # Exploratory report schema + dry-run findings
    repo_context.py     # Read-only collector of relevant repo files by module
    report_writer.py    # Saves timestamped markdown reports
    hello_graph.py      # Phase 1 minimal example (no LLM)
```


### File-by-file explanation

- **`src/state.py`** — Defines `QAState` (`module`, `repo_path`,
  `selected_agents`, `repo_context`, `agent_reports`, `final_report`). This is
  the dictionary that flows through every node.
- **`src/prompts.py`** — System prompts for the orchestrator, the five
  specialized agents, the cross-review step, and the final consolidator. Shared
  Fleet business rules (finance visibility, license class, leave conflicts,
  document ownership, expiry warnings, export consistency) are injected into
  each prompt.
- **`src/repo_context.py`** — `collect_repo_context(repo_path, module, max_files)`
  scans the repo, skips `node_modules/.next/.git/dist/build`, reads only
  `.ts/.tsx/.js/.jsx/.prisma/.md` files, selects files by module keywords, and
  returns combined text (each file truncated to 6000 chars). **Read-only.**
- **`src/graph.py`** — Builds the LangGraph workflow and the LLM-powered nodes.
  Uses `ChatOpenAI` with `OPENAI_MODEL` and `OPENAI_API_KEY` from the
  environment, temperature 0. Each agent node only runs if it is selected.
- **`src/report_writer.py`** — `write_report(module, content)` creates `reports/`
  if needed and saves a timestamped markdown file.
- **`src/main.py`** — CLI that wires everything together and prints the report
  path.

## Setup

### 1. Create and activate a virtual environment

```bash
cd qa-agents
python3 -m venv .venv
source .venv/bin/activate
```

> If you already created `.venv` in Phase 1, just run
> `source .venv/bin/activate`. To leave it later, run `deactivate`.

### 2. Install requirements

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

Copy the example file and fill in your real values:

```bash
cp .env.example .env
```

Then edit `.env`:

```
OPENAI_API_KEY=sk-...your real key...
OPENAI_MODEL=gpt-4o-mini
FLEET_REPO_PATH=..
QA_DRY_RUN=true
```

- **No API keys are hardcoded** anywhere in the code. They are read from the
  environment (via `.env`), and `.env` is git-ignored.

### Dry-run mode (no API quota needed)

The `QA_DRY_RUN` flag controls whether real OpenAI calls are made:

- **`QA_DRY_RUN=true`** — **No real OpenAI API call is made.** Each agent returns
  a deterministic mock response. This is useful for testing the LangGraph flow
  and report generation **without consuming API quota** (or even without a valid
  key/billing). Mock findings are clearly marked `DRY RUN - NOT REAL BUG`.
- **`QA_DRY_RUN=false`** — Real LLM calls are used via `ChatOpenAI` (requires a
  valid `OPENAI_API_KEY`, `OPENAI_MODEL`, and available quota/billing).

Tip: start with `QA_DRY_RUN=true` to confirm the pipeline produces reports, then
switch to `QA_DRY_RUN=false` for real analysis.

### Structured report format

Every agent — in both dry-run and real-LLM mode — produces the same structured
**exploratory** QA schema. Each **agent report** contains:

- `# Exploratory Agent Report — [agent_name]`
- `## Module`, `## Applied Testing Principles`, `## Session Charter`
- `## Risk Focus`
- `## Exploratory Test Ideas` (ID, Principle, Role, Scenario, Steps, Expected
  Result, Evidence Needed, Status)
- `## Bug Candidates` (ID, Title, Category, Severity, Priority, Role,
  Preconditions, Steps to Reproduce, Expected Result, Actual/Suspected,
  Evidence Needed, Status)
- `## Data Integrity Checks`, `## RBAC Checks`, `## Regression Checklist`,
  `## Agent Recommendation`

The **consolidated final report** (`latest_[module]_qa_report.md`) follows:

- `# Exploratory QA Report — [module]`
- `## Execution Mode` (DRY RUN or REAL LLM)
- `## Session Charter`
- `## Testing Principles Applied` (table: `| Principle | Covered? | Where |`)
- `## Selected Agents`, `## Executive Summary`
- `## Confirmed Bugs` (evidence only — **empty in dry-run**)
- `## Bug Candidates` (table: `| ID | Severity | Priority | Agent | Title | Status |`)
- `## Risks`, `## Test Ideas`, `## UX Issues`, `## Questions / Requirement Gaps`
- `## Manual Exploratory Test Checklist`, `## Regression Checklist`,
  `## Final Recommendation`

In **dry-run** mode the findings are realistic and **module-specific** (e.g. for
`documents`: ownership binding, expired documents, reminder generation, wrong
owner binding, file-upload validation, role-based visibility, deep filtering,
duplicate uploads, unsupported file types, long file names, refresh/back
behavior). Different agents produce different findings, **Confirmed Bugs stays
empty**, and **every item is marked `DRY RUN - NEEDS MANUAL VERIFICATION`**. The
schema and findings live in `src/qa_schema.py`.



Before running the orchestrator, confirm your variables loaded correctly. This
never prints the full key:

```bash
python src/check_env.py
```

Expected output when configured:

```
OPENAI_API_KEY: sk-proj-...
OPENAI_MODEL: gpt-4o-mini
```

Or when not yet configured:

```
OPENAI_API_KEY: missing or placeholder
OPENAI_MODEL: missing
```

## Running a QA orchestration

Run the **documents** module test (from inside `qa-agents/`, with the venv
active):

```bash
python src/main.py --module documents --repo ..
```

Run **other modules** by changing `--module`:

```bash
python src/main.py --module auth --repo ..
python src/main.py --module vehicles --repo ..
python src/main.py --module einsatzplan --repo ..
python src/main.py --module requests --repo ..
python src/main.py --module dashboard --repo ..
python src/main.py --module export --repo ..
python src/main.py --module drivers --repo ..
```

Run only specific agents (optional):

```bash
python src/main.py --module documents --repo .. --agents auth_rbac_agent,data_integrity_agent
```

Available agents: `auth_rbac_agent`, `data_integrity_agent`,
`forms_validation_agent`, `business_flow_agent`, `ui_ux_agent`.

## What output to expect

While running you will see progress lines such as:

```
Starting QA orchestration for module 'documents'...
[collect_context] reading repository files...
[plan_test] building risk-based test plan...
[auth_rbac_agent] running...
[data_integrity_agent] running...
[forms_validation_agent] running...
[business_flow_agent] running...
[ui_ux_agent] running...
[cross_review] reviewing agent reports...
[consolidate_report] building final report...

Done.
Report written to: .../qa-agents/reports/report_documents_2026-06-22_141530.md
```

Open that markdown file to read the consolidated exploratory test report with
bugs, risks, and a final Go / No-Go recommendation.

## How to execute a manual exploratory session

The generated report is also turned into a practical, browser-executable session
sheet. The manual-testing assets live alongside the agents:

```
qa-agents/
  sessions/
    documents_manual_session.md      # Ready-to-run session for the documents module
  templates/
    exploratory_session_template.md  # Reusable session template for any module
    bug_report_template.md           # Reusable detailed bug report template
  bugs/
    bug_log.md                       # Running table of confirmed bugs
```

Steps:

1. **Start the Fleet app** (backend on `:3000`, frontend on `:3001`) and open
   `http://localhost:3001`.
2. **Open** [sessions/documents_manual_session.md](sessions/documents_manual_session.md)
   and fill in the Session Info (date, tester, browser, test data, roles).
3. **Execute the test cases one by one** (TC-DOC-001 … TC-DOC-010), following the
   steps in the browser.
4. **Mark each status** as `Pass`, `Fail`, or `Blocked`, and record the Actual
   Result.
5. **If a test fails**, create a bug from
   [templates/bug_report_template.md](templates/bug_report_template.md) and add a
   row to [bugs/bug_log.md](bugs/bug_log.md), linking it back to the test case
   ID (e.g. `TC-DOC-002`).
6. **Attach evidence** (screenshot, console, network, DB/API, video) to the test
   case and the bug report.

To start a session for a **different module**, copy
`templates/exploratory_session_template.md` to
`sessions/<module>_manual_session.md` and fill in test cases using that module's
report checklist.



## Full-System QA Orchestration

The full-system mode turns the single-module workflow into a **system-wide
foundation**. Instead of testing one module, it **discovers Fleet modules**,
**creates test roles (personas)**, and **builds a full-system exploratory test
matrix** that spans every module and testing principle.

### What it does

```
START
  -> load_testing_principles
  -> discover_system_modules     (read-only scan of the repo)
  -> create_test_roles           (login personas across tenants)
  -> build_test_matrix           (scenarios per module x principle)
  -> write_full_system_outputs   (roles, matrix, consolidated report)
  -> END
```

### Test roles vs. agent roles

- **Test roles (personas)** in [roles/test_roles.md](roles/test_roles.md) are
  *who we log in as* while testing — e.g. `office_tenant_a`, `driver_tenant_b_1`.
  Each persona has explicit allowed/forbidden actions and a tenant, so we can
  probe RBAC and tenant isolation. `tenant_b` personas exist for cross-tenant /
  direct-ID access testing.
- **Agent roles** are the QA *specialists* referenced by each scenario
  (Auth & RBAC, Data Integrity, Forms & Validation, Business Flow, UI/UX,
  Security, Regression) — they describe *what kind of testing* the scenario is.

### It does not confirm bugs

Following the **evidence-based bug reporting** principle, this foundation mode
produces **test ideas only** — never confirmed bugs. Every scenario in the
matrix is a candidate that must be reproduced manually with evidence
(screenshot + API/network + DB/export where relevant) before it can be promoted
to a confirmed bug. The report is marked `DRY RUN - NEEDS MANUAL VERIFICATION`.

### It does not call OpenAI in dry-run/foundation mode

Module discovery, role creation, the test matrix, and all output files are
generated **deterministically** with no network and no API key required. This
works with `QA_DRY_RUN=true`.

### Run the full system

```bash
python src/main.py --mode full --repo ..
```

This writes:

- [roles/test_roles.md](roles/test_roles.md) — the test personas.
- [matrix/fleet_test_matrix.md](matrix/fleet_test_matrix.md) — the full-system
  exploratory test matrix (per module × principle).
- [reports/full_system_qa_report.md](reports/full_system_qa_report.md) — the
  consolidated report: discovered modules, roles, and matrix summary.

The `roles/`, `matrix/`, and `reports/` folders are created automatically.

### Run a single module

```bash
python src/main.py --module documents --repo ..
```

If neither `--module` nor `--mode full` is provided, the CLI prints a helpful
error explaining both commands.

## Phase 7A: Playwright Evidence Execution

The LangGraph side of this project **plans** testing: it discovers modules,
creates test roles, and builds a full-system **test matrix** (and, later, a
problem inventory). It does not — and cannot — confirm bugs on its own.

Phase 7A adds the **execution** side: a Playwright browser harness in
[e2e/](e2e/) that will run selected test cases against the live Fleet app and
collect **evidence** — screenshots, traces, and videos. This is what turns a
*test idea* into a *confirmed bug*:

- LangGraph generates the **test matrix** and (later) the **problem inventory**.
- Playwright **executes** selected scenarios in a real browser.
- The run produces **evidence** (screenshots / traces / videos) under
  `e2e/test-results/` and `e2e/playwright-report/`.
- A finding is only promoted to a **confirmed bug** when backed by that evidence
  — no fake passes, and unknown selectors/behaviors are skipped with a reason.

Phase 7A only **sets up** the harness (smoke tests + skipped RBAC scaffolding).
Wiring Playwright into the LangGraph graph is **Phase 7B**.

See [e2e/README.md](e2e/README.md) for install/run instructions:

```bash
cd qa-agents/e2e
npm install
npx playwright install chromium
cp .env.e2e.example .env.e2e   # then fill in credentials (never committed)
npm run test
```

---

## Phase 7B: Playwright Evidence Execution (wired into LangGraph)

Phase 7B connects the Phase 7A harness into the full-system LangGraph workflow
so the orchestrator can optionally **execute** Playwright and produce an
**evidence report**.

**Playwright execution is optional and opt-in.** By default the full-system flow
behaves exactly as before (planning only, no browser run, no OpenAI calls in
dry-run). To execute the harness, pass `--execute-e2e`:

```bash
python src/main.py --mode full --repo .. --execute-e2e
```

Requirements before using `--execute-e2e`:

- The **Fleet app must be running** and reachable at the `BASE_URL` configured in
  `e2e/.env.e2e` (the URL that serves the login UI).
- `e2e/.env.e2e` must be configured (copied from `e2e/.env.e2e.example`), with
  role credentials filled in. Credentials are **never** hardcoded or committed.
- Playwright dependencies installed (`npm install` + `npx playwright install
  chromium` inside `e2e/`).

The new `execute_playwright_tests` node runs at the end of the full-system graph:

```
... -> write_full_system_outputs -> execute_playwright_tests -> END
```

It shells out to `npx playwright test --reporter=json` in `e2e/`, captures the
results, and writes:

- `reports/evidence_report.md` — execution summary, interpretation rules, failed
  / skipped test lists, and **Problem Inventory Impact**.
- `evidence/playwright_results.json` — raw Playwright JSON reporter output.
- `evidence/playwright_stderr.log` — captured stderr.

**Evidence rules (enforced):** a passing test only means a risk was *not
reproduced*; a failing test becomes *Evidence Found - Needs Triage* only when it
maps explicitly to a candidate; nothing is auto-promoted to a **Confirmed Bug**
without evidence. If Playwright cannot run (app down, missing deps), the node
does **not** crash the graph — it records a structured *BLOCKED* result and the
evidence report explains why.

## Phase 7D: Scenario Coverage Tracker

Phase 7D makes the planning-vs-execution gap explicit.

- The **168 scenarios** in `matrix/fleet_test_matrix.md` are the generated
  exploratory matrix. They are **not** all executed tests.
- The Playwright evidence (`passed` / `failed` / `skipped`) reflects the
  **actual browser execution** only.
- `reports/scenario_coverage_report.md` bridges the two by showing which matrix
  scenarios have explicit Playwright coverage, which remain manual-only, and
  which are blocked by missing credentials, selectors, routes, or test data.

The full-system graph now ends with:

```
... -> write_full_system_outputs -> execute_playwright_tests -> build_scenario_coverage -> write_scenario_coverage_report -> END
```

If `--execute-e2e` is **not** passed, the coverage report is still generated,
but it marks the matrix rows as not executed/manual-needed rather than implying
they ran. When `--execute-e2e` **is** passed, the coverage report shows the gap
between the exploratory plan and the subset of scenarios that have real
Playwright evidence.

## Reducing Skipped Tests

To reduce skipped Playwright tests without modifying Fleet app code:

1. Fill `e2e/.env.e2e` with local test credentials and the correct `BASE_URL`.
  Keep `e2e/.env.e2e.example` as placeholders only.
2. Run `npm run check:env` inside `e2e/` to confirm which roles are configured
  without printing secrets.
3. Run Playwright (`npm run test`) to see which tests execute and which still
  skip.
4. Use `matrix/scenario_mapping.json` to connect real Playwright tests to the
  generated matrix rows.
5. Use `reports/test_data_requirements.md` to identify the seed data, known ids,
  and selectors needed to unblock the remaining high-risk document tests.

---

`src/hello_graph.py` is the minimal Phase 1 example with no LLM. Run it to
confirm LangGraph itself works:

```bash
python src/hello_graph.py
```

### Phase 1 expected output

```
[collect_context_node] running...
[plan_test_node] running...
[final_report_node] running...
{'module': 'documents', 'steps': ['Collected context for module \'documents\'.', 'Planned tests for module \'documents\'.', 'Generated final report for module \'documents\'.']}
```
