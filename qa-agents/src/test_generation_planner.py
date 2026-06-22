"""Phase 9: decide runnable tests and generate Playwright skeletons."""

from __future__ import annotations

import os


def _ensure_generated_dir(e2e_dir: str) -> str:
    generated_dir = os.path.join(e2e_dir, "tests", "generated")
    os.makedirs(generated_dir, exist_ok=True)
    return generated_dir


def _generate_auth_rbac_file(path: str) -> None:
    content = r"""import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.resolve(__dirname, '..', '..', '.auth');

function storageStateFor(role: string): string | null {
  const p = path.join(AUTH_DIR, `${role}.json`);
  return fs.existsSync(p) ? p : null;
}

test('[TM-001] logout then browser back should not expose protected page', async ({ page }) => {
  const state = storageStateFor('admin');
  test.skip(!state, 'Missing .auth/admin.json — configure ADMIN_* credentials to enable TM-001.');

    const browser = page.context().browser();
    test.skip(!browser, 'Browser context unavailable for TM-001.');
    const context = await browser!.newContext({ storageState: state! });
    const authedPage = await context.newPage();

  await authedPage.goto('/dashboard');
  await expect(authedPage).toHaveURL(/\/dashboard/, { timeout: 15000 });

  const logoutButton = authedPage.getByRole('button', {
    name: /logout|log out|abmelden|çıkış|sign out/i,
  });
  await expect(logoutButton.first()).toBeVisible({ timeout: 15000 });
  await logoutButton.first().click();

  await expect(authedPage).toHaveURL(/\/login/, { timeout: 15000 });
  await authedPage.goBack();
  await expect(authedPage).toHaveURL(/\/login/, { timeout: 15000 });

    await context.close();
});

test('[TM-004] office should not access finance route if route exists', async ({ browser }) => {
  const state = storageStateFor('office');
  test.skip(!state, 'Missing .auth/office.json — configure OFFICE_* credentials to enable TM-004.');

    const context = await browser.newContext({ storageState: state! });
    const page = await context.newPage();
  await page.goto('/billing');

  // Security expectation: office must not remain on the billing route.
  await expect(page).not.toHaveURL(/\/billing\/?$/, { timeout: 15000 });
    await context.close();
});
"""
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)


def generate_or_select_playwright_tests(plan: list[dict], e2e_dir: str) -> dict:
    generated_dir = _ensure_generated_dir(e2e_dir)

    runnable: list[dict] = []
    blocked: list[dict] = []
    generated_files: list[str] = []

    needs_auth_file = False
    for item in plan:
        if item.get("blocked"):
            blocked.append(item)
            continue

        if item.get("existing_playwright_test"):
            runnable.append({**item, "run_mode": "existing"})
            continue

        if item.get("new_playwright_test_required"):
            scenario_id = str(item.get("scenario_id", ""))
            if scenario_id in {"TM-001", "TM-004"}:
                needs_auth_file = True
                runnable.append({**item, "run_mode": "generated"})
            else:
                blocked.append(
                    {
                        **item,
                        "blocked": True,
                        "blocker_reason": "Route/action/assertion are not yet reliable enough for a non-flaky generated test skeleton.",
                    }
                )
            continue

        blocked.append(
            {
                **item,
                "blocked": True,
                "blocker_reason": item.get("blocker_reason")
                or "Scenario is not executable with current route/selector/data context.",
            }
        )

    if needs_auth_file:
        file_path = os.path.join(generated_dir, "priority-auth-rbac.generated.spec.ts")
        _generate_auth_rbac_file(file_path)
        generated_files.append(file_path)

    return {
        "plan": plan,
        "runnable": runnable,
        "blocked": blocked,
        "generated_files": generated_files,
    }
