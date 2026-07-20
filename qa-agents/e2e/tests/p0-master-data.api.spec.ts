import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type APIRequestContext } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';
const E2E_ROOT = path.resolve(__dirname, '..');
const BACKEND_ROOT = path.resolve(E2E_ROOT, '../../backend');
const FIXTURE_PATH = path.resolve(E2E_ROOT, '.auth/p0-fixture.json');
type Role = 'admin' | 'boss' | 'accounting' | 'office' | 'driver';
type Entity = { id: string };
type FixtureManifest = {
  tenantA: {
    tenantId: string;
    users: Record<Role, Entity & { email: string }>;
    driver: Entity;
    vehicle: Entity;
    company: Entity;
  };
  tenantB: {
    users: Record<Role, Entity>;
    driver: Entity;
    vehicle: Entity;
    company: Entity;
  };
  accessTokens: Record<string, Record<Role, string>>;
};

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function expectStatus(response: Awaited<ReturnType<APIRequestContext['get']>>, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

test.describe.serial('P0 users and master data API', () => {
  let fixture: FixtureManifest;
  let token: Record<Role, string>;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'seed:p0-qa'], { cwd: BACKEND_ROOT, env: process.env, stdio: 'pipe' });
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureManifest;
    token = fixture.accessTokens[fixture.tenantA.tenantId];
  });

  test('user CRUD is admin-only and rejects escalation/mass assignment', async ({ request }) => {
    await expectStatus(await request.get(`${API_BASE_URL}/users`, { headers: auth(token.admin) }), 200);
    for (const role of ['boss', 'accounting', 'office', 'driver'] as const) {
      await expectStatus(await request.get(`${API_BASE_URL}/users`, { headers: auth(token[role]) }), 403);
    }

    const officeEscalation = await request.post(`${API_BASE_URL}/users`, {
      headers: auth(token.office),
      data: { full_name: 'Escalation Attempt', email: 'escalation@qa.invalid', password: 'QaOnly-2026!', role: 'admin' },
    });
    await expectStatus(officeEscalation, 403);

    const massAssignment = await request.post(`${API_BASE_URL}/users`, {
      headers: auth(token.admin),
      data: {
        full_name: 'Mass Assignment Attempt',
        email: 'mass-assignment@qa.invalid',
        password: 'QaOnly-2026!',
        role: 'office',
        tenantId: 'qa-p0-tenant-b',
        ownerId: fixture.tenantB.users.admin.id,
        createdAt: '2000-01-01T00:00:00.000Z',
      },
    });
    await expectStatus(massAssignment, 400);

    const unique = Date.now();
    const created = await request.post(`${API_BASE_URL}/users`, {
      headers: auth(token.admin),
      data: { full_name: 'QA CRUD User', email: `qa-crud-${unique}@qa.invalid`, password: 'QaOnly-2026!', role: 'office' },
    });
    await expectStatus(created, 201);
    const createdUser = await created.json() as Entity;
    await expectStatus(await request.patch(`${API_BASE_URL}/users/${createdUser.id}`, {
      headers: auth(token.admin), data: { full_name: 'QA CRUD User Updated' },
    }), 200);
    await expectStatus(await request.delete(`${API_BASE_URL}/users/${createdUser.id}`, {
      headers: auth(token.admin),
    }), 200);
    await expectStatus(await request.get(`${API_BASE_URL}/users/${fixture.tenantB.users.admin.id}`, {
      headers: auth(token.admin),
    }), 404);
  });

  test('drivers enforce validation, read/write roles, duplicates, and tenant boundaries', async ({ request }) => {
    for (const role of ['admin', 'boss', 'accounting', 'office'] as const) {
      await expectStatus(await request.get(`${API_BASE_URL}/drivers?page=1&limit=2&status=active&search=QA`, {
        headers: auth(token[role]),
      }), 200);
    }
    await expectStatus(await request.get(`${API_BASE_URL}/drivers`, { headers: auth(token.driver) }), 403);
    await expectStatus(await request.post(`${API_BASE_URL}/drivers`, {
      headers: auth(token.accounting), data: {},
    }), 403);
    await expectStatus(await request.post(`${API_BASE_URL}/drivers`, {
      headers: auth(token.office), data: { first_name: '', last_name: '', license_number: 'x', license_expiry_date: '2000-01-01' },
    }), 400);
    await expectStatus(await request.get(`${API_BASE_URL}/drivers/${fixture.tenantB.driver.id}`, {
      headers: auth(token.admin),
    }), 404);

    const employeeNumber = `QA-API-DRV-${Date.now()}`;
    const payload = {
      first_name: 'API', last_name: 'Driver', employee_number: employeeNumber,
      license_number: 'QA-API-12345', license_expiry_date: '2030-01-01',
    };
    const created = await request.post(`${API_BASE_URL}/drivers`, { headers: auth(token.office), data: payload });
    await expectStatus(created, 201);
    const createdDriver = await created.json() as Entity;
    const duplicate = await request.post(`${API_BASE_URL}/drivers`, { headers: auth(token.office), data: payload });
    expect([400, 409]).toContain(duplicate.status());
    await expectStatus(await request.patch(`${API_BASE_URL}/drivers/${createdDriver.id}`, {
      headers: auth(token.office), data: { notes: 'updated-by-p0-api' },
    }), 200);
    await expectStatus(await request.delete(`${API_BASE_URL}/drivers/${createdDriver.id}`, {
      headers: auth(token.office),
    }), 200);
  });

  test('vehicles enforce validation, read/write roles, duplicates, sorting, and tenant boundaries', async ({ request }) => {
    for (const role of ['admin', 'boss', 'accounting', 'office'] as const) {
      await expectStatus(await request.get(`${API_BASE_URL}/vehicles?page=1&limit=2&sortBy=plateNumber&sortOrder=asc`, {
        headers: auth(token[role]),
      }), 200);
    }
    await expectStatus(await request.get(`${API_BASE_URL}/vehicles`, { headers: auth(token.driver) }), 403);
    await expectStatus(await request.post(`${API_BASE_URL}/vehicles`, {
      headers: auth(token.accounting), data: {},
    }), 403);
    await expectStatus(await request.post(`${API_BASE_URL}/vehicles`, {
      headers: auth(token.office), data: { plate_number: '', brand: '', model: '', year: 1800 },
    }), 400);
    await expectStatus(await request.get(`${API_BASE_URL}/vehicles/${fixture.tenantB.vehicle.id}`, {
      headers: auth(token.admin),
    }), 404);

    const suffix = Date.now();
    const payload = { plate_number: `QA-X ${suffix}`, internal_code: `QA-X-${suffix}`, brand: 'QA', model: 'API' };
    const created = await request.post(`${API_BASE_URL}/vehicles`, { headers: auth(token.office), data: payload });
    await expectStatus(created, 201);
    const createdVehicle = await created.json() as Entity;
    const duplicate = await request.post(`${API_BASE_URL}/vehicles`, { headers: auth(token.office), data: payload });
    expect([400, 409]).toContain(duplicate.status());
    await expectStatus(await request.patch(`${API_BASE_URL}/vehicles/${createdVehicle.id}`, {
      headers: auth(token.office), data: { notes: 'updated-by-p0-api' },
    }), 200);
    await expectStatus(await request.delete(`${API_BASE_URL}/vehicles/${createdVehicle.id}`, {
      headers: auth(token.office),
    }), 200);
  });

  test('companies mask financial data and enforce accounting read-only and office writes', async ({ request }) => {
    const accountingRead = await request.get(`${API_BASE_URL}/companies/${fixture.tenantA.company.id}`, {
      headers: auth(token.accounting),
    });
    await expectStatus(accountingRead, 200);
    expect((await accountingRead.json() as { default_daily_revenue: number | null }).default_daily_revenue).toBe(1234.56);

    const officeRead = await request.get(`${API_BASE_URL}/companies/${fixture.tenantA.company.id}`, {
      headers: auth(token.office),
    });
    await expectStatus(officeRead, 200);
    expect((await officeRead.json() as { default_daily_revenue: number | null }).default_daily_revenue).toBeNull();
    await expectStatus(await request.get(`${API_BASE_URL}/companies`, { headers: auth(token.driver) }), 403);
    await expectStatus(await request.post(`${API_BASE_URL}/companies`, {
      headers: auth(token.accounting), data: { name: 'Accounting Write Attempt' },
    }), 403);
    await expectStatus(await request.post(`${API_BASE_URL}/companies`, {
      headers: auth(token.office), data: { name: 'Office Financial Attempt', default_daily_revenue: 999 },
    }), 403);
    await expectStatus(await request.get(`${API_BASE_URL}/companies/${fixture.tenantB.company.id}`, {
      headers: auth(token.admin),
    }), 404);

    const name = `QA API Company ${Date.now()}`;
    const created = await request.post(`${API_BASE_URL}/companies`, {
      headers: auth(token.office), data: { name, email: 'api-company@qa.invalid' },
    });
    await expectStatus(created, 201);
    const createdCompany = await created.json() as Entity;
    const duplicate = await request.post(`${API_BASE_URL}/companies`, {
      headers: auth(token.office), data: { name },
    });
    expect([400, 409]).toContain(duplicate.status());
    await expectStatus(await request.patch(`${API_BASE_URL}/companies/${createdCompany.id}`, {
      headers: auth(token.office), data: { notes: 'updated-by-p0-api' },
    }), 200);
    await expectStatus(await request.delete(`${API_BASE_URL}/companies/${createdCompany.id}`, {
      headers: auth(token.office),
    }), 200);
  });
});