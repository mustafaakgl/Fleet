# Fleet QA — Playwright Evidence Harness (Phase 7A)

This folder contains the Playwright browser-testing harness used by the Fleet QA
agents to **execute exploratory test cases and collect evidence** (screenshots,
traces, videos). It is intentionally standalone for now — Phase 7B will connect
it to the LangGraph orchestrator.

> This harness only **drives** the Fleet web app in a browser. It never modifies
> Fleet application code, and it never stores credentials in source.

## Install

```bash
cd qa-agents/e2e
npm install
npx playwright install chromium
```

## Configure

Copy the example env file and fill in real values. **Never commit `.env.e2e`.**

```bash
cp .env.e2e.example .env.e2e
```

Then edit `.env.e2e`:

- `BASE_URL` — the Fleet web app URL that serves the login page. The backend API
  commonly runs on `:3000` and the Next.js frontend on `:3001`; point `BASE_URL`
  at whichever serves the UI in your environment.
- `*_EMAIL` / `*_PASSWORD` — credentials for each role you want to test
  (`ADMIN`, `BOSS`, `ACCOUNTING`, `OFFICE`, `DRIVER`). Leave a role blank to
  skip generating its auth state.

## Run

```bash
npm run test            # headless run
npm run test:headed     # watch it in a real browser
npm run test:debug      # step through with the Playwright inspector
npm run test:report     # open the last HTML report
```

## How auth state works

`auth/auth.setup.ts` runs first (the Playwright `setup` project). For each role
that has credentials in `.env.e2e`, it:

1. Opens `/login?manual=1` (the `manual=1` flag bypasses dev auto-login).
2. Fills `#email` / `#password` and submits the form.
3. Waits until the app leaves `/login`.
4. Saves the authenticated session (cookies + localStorage) to
   `.auth/<role>.json`.

Roles **without** credentials are skipped with a clear message — no fake or empty
auth state is written. Authenticated specs reuse `.auth/<role>.json` so they do
not log in repeatedly.

If the Fleet login form changes, update the selector constants at the top of
`auth/auth.setup.ts`.

## How evidence is stored

Evidence collection is configured in `playwright.config.ts`:

- **Screenshots** — captured on failure.
- **Traces** — captured on first retry (viewable with `npm run test:report` or
  `npx playwright show-trace`).
- **Videos** — retained on failure.

Artifacts are written to:

- `test-results/` — raw screenshots, videos, and traces per test.
- `playwright-report/` — the browsable HTML report.

Both folders, plus `.auth/` and `.env.e2e`, are git-ignored.

## Test suites

- `tests/smoke.spec.ts` — basic availability: the app responds, has no immediate
  5xx error, renders a title/body, and the login page is reachable.
- `tests/documents.rbac.spec.ts` — intended RBAC checks for the documents module.
  These are currently `test.skip` with explicit reasons until the exact
  selectors, routes, and deny/redirect behavior are confirmed. They will be
  enabled in a later phase. **They never fake-pass.**

## Safety

- No credentials are hardcoded; everything comes from `.env.e2e`.
- `.env.e2e`, `.auth/`, `test-results/`, and `playwright-report/` are git-ignored.
- Unknown selectors/behaviors are skipped with a reason rather than asserted
  falsely.
