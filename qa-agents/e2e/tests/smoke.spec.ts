import * as fs from 'fs';
import * as path from 'path';
import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';

/**
 * Smoke tests — the most basic "is the app up?" checks.
 *
 * These run unauthenticated against BASE_URL. They verify the app responds,
 * does not immediately return a server error, and renders a page with a title.
 * Screenshots are captured automatically on failure (see playwright.config.ts).
 *
 * No project dependency on `setup` is required for smoke tests, but they share
 * the same `chromium` project config; if `setup` is skipped (no credentials),
 * these still run because they do not rely on any storage state.
 */

test.describe('Smoke', () => {
  test('[TM-001] home page responds without a server error', async ({ page }) => {
    const response = await page.goto('/');

    // A navigation response should exist and not be a 5xx server error.
    expect(response, 'No navigation response was received for BASE_URL.').not.toBeNull();
    const status = response?.status() ?? 0;
    expect(status, `Unexpected server error status ${status} at BASE_URL.`).toBeLessThan(500);
  });

  test('page renders a document title and body', async ({ page }) => {
    await page.goto('/');

    // The HTML document should expose a title (string can be empty on some SPAs,
    // but the property must resolve without throwing).
    const title = await page.title();
    expect(typeof title).toBe('string');

    // The main body should be attached and visible — i.e. something rendered.
    await expect(page.locator('body')).toBeVisible();
  });

  test('login page is reachable', async ({ page }) => {
    // The login route is a stable, public entry point in the Fleet frontend.
    // `?manual=1` opts out of the dev auto-login redirect so the form renders.
    const cssResponsePromise = page.waitForResponse(
      (response) => {
        const url = response.url();
        return url.includes('/_next/static/') && /\.css(?:\?|$)/.test(url);
      },
      { timeout: 15_000 },
    );

    const response = await page.goto('/login?manual=1');
    const status = response?.status() ?? 0;
    expect(status, `Login route returned a server error (${status}).`).toBeLessThan(500);

    // The login email field is the anchor for later authenticated flows.
    await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });

    const cssResponse = await cssResponsePromise;
    expect(cssResponse.status()).toBeLessThan(500);
  });

  test('login page is localized for DE/EN/TR without raw i18n keys', async ({ page }) => {
    const languageCases = [
      {
        lang: 'de',
        headline: 'Ihre Flotte wartet schon.',
        valueProp: /Fristen,\s*Lenkzeiten,\s*F[üu]hrerscheine/i,
        cardTitle: 'Alles im Blick',
        sample: 'Beispielansicht',
      },
      {
        lang: 'en',
        headline: 'Your fleet is already waiting.',
        valueProp: /Deadlines,\s*driving hours,\s*and license checks/i,
        cardTitle: 'Everything in view',
        sample: 'Sample view',
      },
      {
        lang: 'tr',
        headline: 'Filonuz sizi bekliyor.',
        valueProp: /Son tarihler,\s*s[uü]r[üu][sş]\s*s[uü]releri,\s*ehliyet kontrolleri/i,
        cardTitle: /Her\s*[şs]ey\s*g[oö]r[uü]n[uü]rde/i,
        sample: /[ÖO]rnek g[oö]r[uü]n[uü]m/i,
      },
    ] as const;

    for (const testCase of languageCases) {
      await page.goto('/login?manual=1');
      await page.evaluate((lng) => {
        localStorage.setItem('fleet_language', lng);
        document.cookie = `fleet_language=${encodeURIComponent(lng)};path=/`;
      }, testCase.lang);
      await page.reload();

      await expect(page.locator('#email')).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(testCase.headline)).toBeVisible();
      await expect(page.locator('.login-status-titel')).toHaveText(testCase.cardTitle);
      await expect(page.getByText(testCase.sample)).toBeVisible();
      await expect(page.getByText(testCase.valueProp)).toBeVisible();

      await expect(page.getByText(/auth\.login\./i)).toHaveCount(0);
    }
  });
});

const OFFICE_AUTH_STATE = path.resolve(__dirname, '..', '.auth', 'office.json');
const DRIVER_AUTH_STATE = path.resolve(__dirname, '..', '.auth', 'driver.json');
const MINIMAL_PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF', 'utf8');

function readAccessToken(storageStatePath: string): string | null {
  if (!fs.existsSync(storageStatePath)) {
    return null;
  }

  const raw = fs.readFileSync(storageStatePath, 'utf8');
  const state = JSON.parse(raw) as {
    origins?: Array<{
      localStorage?: Array<{ name?: string; value?: string }>;
    }>;
  };

  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if ((entry.name === 'accessToken' || entry.name === 'fleet_access_token') && entry.value) {
        return entry.value;
      }
    }
  }

  return null;
}

function readStoredUser(storageStatePath: string): { id: string; role: string; email: string } | null {
  if (!fs.existsSync(storageStatePath)) {
    return null;
  }

  const raw = fs.readFileSync(storageStatePath, 'utf8');
  const state = JSON.parse(raw) as {
    origins?: Array<{
      localStorage?: Array<{ name?: string; value?: string }>;
    }>;
  };

  for (const origin of state.origins ?? []) {
    for (const entry of origin.localStorage ?? []) {
      if ((entry.name === 'user' || entry.name === 'fleet_user') && entry.value) {
        return JSON.parse(entry.value) as { id: string; role: string; email: string };
      }
    }
  }

  return null;
}

test.describe('Office smoke', () => {
  test.skip(!fs.existsSync(OFFICE_AUTH_STATE), 'Missing .auth/office.json — run auth setup with OFFICE_EMAIL/OFFICE_PASSWORD first.');
  test.use({ storageState: OFFICE_AUTH_STATE });

  test('office login reaches assignments without a forbidden state', async ({ page }) => {
    const response = await page.goto('/assignments');

    expect(response, 'No navigation response was received for the office assignments route.').not.toBeNull();
    expect(response?.status() ?? 0).toBeLessThan(500);
    await expect(page).toHaveURL(/\/assignments/, { timeout: 20_000 });
  });

  test('service reminders route opens and renders empty state when no data', async ({ page }) => {
    await page.route(/\/api\/v1\/vehicles(\?|$)/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], total: 0, page: 1, limit: 100 }),
      });
    });
    await page.route(/\/api\/v1\/service-records(\?|$)/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route(/\/api\/v1\/reminders(\?|$)/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    const response = await page.goto('/reminders/service');
    expect(response, 'No navigation response was received for service reminders.').not.toBeNull();
    expect(response?.status() ?? 0).toBe(200);

    await expect(page.getByText(/No service reminders yet|No service reminders|Noch keine Service-Erinnerungen|Keine Service-Erinnerungen|Henüz servis hatırlatması yok|Servis hatırlatıcısı yok/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /Add Service Reminder|Service-Erinnerung hinzufügen|Servis Hatırlatıcısı Ekle/ })).toBeVisible();
  });

  test('office message is visible to driver and driver reply increases office unread count', async ({ request }) => {
    const officeToken = readAccessToken(OFFICE_AUTH_STATE);
    const driverToken = readAccessToken(DRIVER_AUTH_STATE);
    const driverUser = readStoredUser(DRIVER_AUTH_STATE);

    test.skip(!officeToken || !driverToken || !driverUser, 'Missing office/driver auth state for messenger smoke.');

    const officeHeaders = { Authorization: `Bearer ${officeToken}` };
    const driverHeaders = { Authorization: `Bearer ${driverToken}` };

    const conversationsResponse = await request.get(`${API_BASE_URL}/messenger/conversations?limit=100`, {
      headers: officeHeaders,
    });
    expect(conversationsResponse.ok()).toBeTruthy();

    const conversations = await conversationsResponse.json() as Array<{
      id: string;
      driver: { userId: string | null };
    }>;

    const conversation = conversations.find((item) => item.driver.userId === driverUser!.id);
    expect(conversation, 'No office conversation found for the seeded driver user.').toBeTruthy();

    await request.post(`${API_BASE_URL}/messenger/conversations/${conversation!.id}/read`, {
      headers: officeHeaders,
    });
    await request.post(`${API_BASE_URL}/messenger/conversations/${conversation!.id}/read`, {
      headers: driverHeaders,
    });

    const officeMessageText = `office-smoke-${Date.now()}`;
    const driverReplyText = `driver-smoke-${Date.now()}`;

    const officeSend = await request.post(`${API_BASE_URL}/messenger/conversations/${conversation!.id}/messages`, {
      headers: officeHeaders,
      data: {
        text: officeMessageText,
        originalLanguage: 'de',
      },
    });
    expect(officeSend.ok(), await officeSend.text()).toBeTruthy();

    const driverMessages = await request.get(`${API_BASE_URL}/messenger/conversations/${conversation!.id}/messages?limit=20`, {
      headers: driverHeaders,
    });
    expect(driverMessages.ok()).toBeTruthy();
    const driverThread = await driverMessages.json() as Array<{ originalText: string; translatedText: string | null }>;
    expect(driverThread.some((message) => message.originalText === officeMessageText || message.translatedText === officeMessageText)).toBeTruthy();

    const unreadBeforeResponse = await request.get(`${API_BASE_URL}/messenger/unread-count`, {
      headers: officeHeaders,
    });
    expect(unreadBeforeResponse.ok()).toBeTruthy();
    const unreadBefore = await unreadBeforeResponse.json() as {
      byConversation: Array<{ conversationId: string; count: number }>;
    };
    const beforeCount = unreadBefore.byConversation.find((row) => row.conversationId === conversation!.id)?.count ?? 0;

    const driverSend = await request.post(`${API_BASE_URL}/messenger/conversations/${conversation!.id}/messages`, {
      headers: driverHeaders,
      data: {
        text: driverReplyText,
        originalLanguage: 'tr',
      },
    });
    expect(driverSend.ok(), await driverSend.text()).toBeTruthy();

    const unreadAfterResponse = await request.get(`${API_BASE_URL}/messenger/unread-count`, {
      headers: officeHeaders,
    });
    expect(unreadAfterResponse.ok()).toBeTruthy();
    const unreadAfter = await unreadAfterResponse.json() as {
      byConversation: Array<{ conversationId: string; count: number }>;
    };
    const afterCount = unreadAfter.byConversation.find((row) => row.conversationId === conversation!.id)?.count ?? 0;

    expect(afterCount).toBeGreaterThan(beforeCount);
  });
});

test.describe('Driver smoke', () => {
  test.skip(!fs.existsSync(DRIVER_AUTH_STATE), 'Missing .auth/driver.json — run auth setup with DRIVER_EMAIL/DRIVER_PASSWORD first.');
  test.use({ storageState: DRIVER_AUTH_STATE });

  test('driver login reaches morning check-in without a forbidden state', async ({ page }) => {
    const response = await page.goto('/driver/morning-checkin');

    expect(response, 'No navigation response was received for the driver morning check-in route.').not.toBeNull();
    expect(response?.status() ?? 0).toBeLessThan(500);
    await expect(page).toHaveURL(/\/driver\/morning-checkin/, { timeout: 20_000 });
  });

  test('driver can start and stop a work session after satisfying departure check requirements', async ({ request }) => {
    const token = readAccessToken(DRIVER_AUTH_STATE);
    test.skip(!token, 'Missing driver access token in .auth/driver.json.');

    const headers = {
      Authorization: `Bearer ${token}`,
    };

    await request.post(`${API_BASE_URL}/driver/work-sessions/end`, {
      headers,
      data: { reason: 'manual' },
    });

    const statusResponse = await request.get(`${API_BASE_URL}/driver/departure-check/status`, {
      headers,
    });
    expect(statusResponse.ok()).toBeTruthy();
    const departureStatus = await statusResponse.json() as {
      required: boolean;
      completed_today: boolean;
      assignment: { id: string; vehicle_id: string } | null;
      template: { items: Array<{ item_key: string }> } | null;
    };

    if (departureStatus.required && !departureStatus.completed_today) {
      expect(departureStatus.assignment).not.toBeNull();
      expect(departureStatus.template).not.toBeNull();

      const submitResponse = await request.post(`${API_BASE_URL}/driver/departure-check/submit`, {
        headers,
        multipart: {
          payload: JSON.stringify({
            vehicle_id: departureStatus.assignment!.vehicle_id,
            assignment_id: departureStatus.assignment!.id,
            client_submission_id: `e2e-${Date.now()}`,
            offline_captured_at: new Date().toISOString(),
            signature_confirmed_at: new Date().toISOString(),
            items: departureStatus.template!.items.map((item) => ({
              item_key: item.item_key,
              result: 'ok',
            })),
          }),
        },
      });

      expect(submitResponse.ok()).toBeTruthy();
    }

    const startResponse = await request.post(`${API_BASE_URL}/driver/work-sessions/start`, {
      headers,
    });
    expect(startResponse.ok(), await startResponse.text()).toBeTruthy();

    const currentAfterStart = await request.get(`${API_BASE_URL}/driver/work-sessions/current`, {
      headers,
    });
    expect(currentAfterStart.ok()).toBeTruthy();
    expect((await currentAfterStart.json() as { active: boolean }).active).toBe(true);

    const endResponse = await request.post(`${API_BASE_URL}/driver/work-sessions/end`, {
      headers,
      data: { reason: 'manual' },
    });
    expect(endResponse.ok(), await endResponse.text()).toBeTruthy();

    const currentAfterEnd = await request.get(`${API_BASE_URL}/driver/work-sessions/current`, {
      headers,
    });
    expect(currentAfterEnd.ok()).toBeTruthy();
    expect((await currentAfterEnd.json() as { active: boolean }).active).toBe(false);
  });
});

test.describe('Equipment issuance smoke', () => {
  test('office create -> driver sign -> office approve', async ({ request }) => {
    const officeToken = readAccessToken(OFFICE_AUTH_STATE);
    const driverToken = readAccessToken(DRIVER_AUTH_STATE);

    test.skip(!officeToken || !driverToken, 'Missing office/driver auth state for equipment issuance smoke.');

    const officeHeaders = { Authorization: `Bearer ${officeToken}` };
    const driverHeaders = { Authorization: `Bearer ${driverToken}` };

    const meResponse = await request.get(`${API_BASE_URL}/driver/me`, {
      headers: driverHeaders,
    });
    expect(meResponse.ok(), await meResponse.text()).toBeTruthy();
    const me = await meResponse.json() as {
      driver: { id: string };
    };

    const createResponse = await request.post(`${API_BASE_URL}/equipment-issuances`, {
      headers: officeHeaders,
      multipart: {
        driverId: me.driver.id,
        title: 'Arbeitskleidung Ausgabe',
        itemsJson: JSON.stringify([{ name: `Warnweste-${Date.now()}`, quantity: 1 }]),
        file: {
          name: 'office-form.pdf',
          mimeType: 'application/pdf',
          buffer: MINIMAL_PDF,
        },
      },
    });
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    const created = await createResponse.json() as { id: string; status: string };
    expect(created.status).toBe('pending_signature');

    const forbiddenApprove = await request.post(`${API_BASE_URL}/equipment-issuances/${created.id}/approve`, {
      headers: driverHeaders,
      data: { note: 'should fail' },
    });
    expect(forbiddenApprove.status()).toBe(403);

    const signResponse = await request.post(`${API_BASE_URL}/driver/equipment-issuances/${created.id}/sign`, {
      headers: driverHeaders,
      data: {
        signatureDataUrl:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xn8sAAAAASUVORK5CYII=',
      },
    });
    expect(signResponse.ok(), await signResponse.text()).toBeTruthy();
    const signed = await signResponse.json() as {
      status: string;
      finalDocument: { id: string; fileName: string } | null;
    };
    expect(signed.status).toBe('signed');
    expect(signed.finalDocument).not.toBeNull();

    const docsResponse = await request.get(`${API_BASE_URL}/driver/documents`, {
      headers: driverHeaders,
    });
    expect(docsResponse.ok(), await docsResponse.text()).toBeTruthy();
    const docs = await docsResponse.json() as { items: Array<{ documentType: string }> };
    expect(docs.items.some((item) => item.documentType === 'equipment_issuance_final')).toBeTruthy();

    const approveResponse = await request.post(`${API_BASE_URL}/equipment-issuances/${created.id}/approve`, {
      headers: officeHeaders,
      data: { note: 'e2e approval' },
    });
    expect(approveResponse.ok(), await approveResponse.text()).toBeTruthy();
    const approved = await approveResponse.json() as {
      status: string;
      approvedAt: string | null;
      finalDocument: { id: string } | null;
    };
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.finalDocument?.id).toBeTruthy();
  });
});
