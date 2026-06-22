import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from `.env.e2e` (never committed). This keeps
// credentials and BASE_URL out of the test code and out of version control.
dotenv.config({ path: path.resolve(__dirname, '.env.e2e') });

// The Fleet web app under test. Defaults to localhost:3000 if not provided.
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

export default defineConfig({
  // Resolve from the e2e root so the setup project (auth/) and the spec suites
  // (tests/) are both discoverable. Each project narrows this with testMatch.
  testDir: '.',

  // Fail the build on CI if test.only is accidentally committed.
  forbidOnly: !!process.env.CI,

  // Retry once on CI to surface flaky failures with traces; none locally.
  retries: process.env.CI ? 1 : 0,

  // Conservative worker count; raise locally once the suite is stable.
  workers: process.env.CI ? 1 : undefined,

  // HTML report written into ./playwright-report (gitignored).
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],

  // Raw artifacts (screenshots, videos, traces) land in ./test-results.
  outputDir: 'test-results',

  use: {
    baseURL: BASE_URL,

    // Evidence collection: capture on failure / retry so we never fake-pass.
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
  },

  projects: [
    // `setup` prepares role-based storage states before the main suites run.
    // It is opt-in: it only runs when credentials are present (see auth.setup).
    {
      name: 'setup',
      testMatch: /auth\/auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Only the spec suites under tests/ run in this project.
      testMatch: /tests\/.*\.spec\.ts/,
      // Depend on setup so authenticated specs can reuse the storage states.
      dependencies: ['setup'],
    },
  ],
});
