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
type TenantFixture = {
  tenantId: string;
  users: Record<Role, Entity>;
  driver: Entity;
  vehicle: Entity;
  company: Entity;
};
type FixtureManifest = {
  tenantA: TenantFixture;
  tenantB: TenantFixture;
  accessTokens: Record<string, Record<Role, string>>;
};

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

function futureDay(offset: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function expectStatus(response: Awaited<ReturnType<APIRequestContext['get']>>, status: number) {
  expect(response.status(), await response.text()).toBe(status);
}

function assignmentPayload(tenant: TenantFixture, workDate: string) {
  return {
    driver_id: tenant.driver.id,
    vehicle_id: tenant.vehicle.id,
    company_id: tenant.company.id,
    cargo_name: 'P0 workflow cargo',
    cargo_owner: 'P0 QA',
    pickup_address: 'Berlin',
    delivery_address: 'Hamburg',
    work_date: workDate,
    start_time: '08:00',
    end_time: '10:00',
    acknowledge_license_compliance_warning: true,
    acknowledge_vehicle_defect_warning: true,
  };
}

function transportPayload(tenant: TenantFixture, requestedDate: string) {
  return {
    driver_id: tenant.driver.id,
    vehicle_id: tenant.vehicle.id,
    company_id: tenant.company.id,
    cargo_name: 'P0 transport cargo',
    cargo_owner: 'P0 QA',
    pickup_address: 'Cologne',
    delivery_address: 'Bonn',
    requested_date: requestedDate,
    start_time: '11:00',
    end_time: '13:00',
  };
}

test.describe.serial('P0 critical workflow API', () => {
  let fixture: FixtureManifest;
  let tokenA: Record<Role, string>;
  let tokenB: Record<Role, string>;

  test.beforeAll(() => {
    execFileSync('npm', ['run', 'seed:p0-qa'], { cwd: BACKEND_ROOT, env: process.env, stdio: 'pipe' });
    fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as FixtureManifest;
    tokenA = fixture.accessTokens[fixture.tenantA.tenantId];
    tokenB = fixture.accessTokens[fixture.tenantB.tenantId];
  });

  test('assignments enforce RBAC, tenant scope, conflicts, transitions, and AT calendar state', async ({ request }) => {
    const workDate = futureDay(420);
    const payload = assignmentPayload(fixture.tenantA, workDate);
    await expectStatus(await request.post(`${API_BASE_URL}/assignments`, {
      headers: auth(tokenA.accounting), data: payload,
    }), 403);
    const foreignAssignment = await request.post(`${API_BASE_URL}/assignments`, {
      headers: auth(tokenA.office), data: assignmentPayload(fixture.tenantB, workDate),
    });
    await expectStatus(foreignAssignment, 404);
    expect(await foreignAssignment.text()).not.toMatch(
      new RegExp(`${fixture.tenantB.driver.id}|${fixture.tenantB.vehicle.id}|${fixture.tenantB.company.id}`),
    );

    const created = await request.post(`${API_BASE_URL}/assignments`, {
      headers: auth(tokenA.office), data: payload,
    });
    await expectStatus(created, 201);
    const assignment = await created.json() as Entity & { status: string };
    expect(assignment.status).toBe('planned');
    await expectStatus(await request.post(`${API_BASE_URL}/assignments`, {
      headers: auth(tokenA.office), data: payload,
    }), 400);

    await expectStatus(await request.post(`${API_BASE_URL}/assignments/${assignment.id}/transition`, {
      headers: auth(tokenA.office), data: { to: 'confirmed' },
    }), 200);
    await expectStatus(await request.post(`${API_BASE_URL}/assignments/${assignment.id}/transition`, {
      headers: auth(tokenA.office), data: { to: 'confirmed' },
    }), 400);
    const calendar = await request.get(`${API_BASE_URL}/calendar?driver_id=${fixture.tenantA.driver.id}&from=${workDate}&to=${workDate}`, {
      headers: auth(tokenA.office),
    });
    await expectStatus(calendar, 200);
    expect((await calendar.json() as Array<{ assignmentId: string; status: string }>).some(
      (event) => event.assignmentId === assignment.id && event.status === 'AT',
    )).toBe(true);

    const concurrentPayload = assignmentPayload(fixture.tenantA, futureDay(421));
    const concurrentResponses = await Promise.all([
      request.post(`${API_BASE_URL}/assignments`, { headers: auth(tokenA.office), data: concurrentPayload }),
      request.post(`${API_BASE_URL}/assignments`, { headers: auth(tokenA.office), data: concurrentPayload }),
    ]);
    expect(concurrentResponses.map((response) => response.status()).sort()).toEqual(
      expect.arrayContaining([201]),
    );
    expect(concurrentResponses.filter((response) => response.status() === 201)).toHaveLength(1);
    expect([400, 409]).toContain(concurrentResponses.find((response) => response.status() !== 201)?.status());
    const concurrentCreated = concurrentResponses.find((response) => response.status() === 201);
    const concurrentAssignment = await concurrentCreated?.json() as Entity;
    const concurrentCalendar = await request.get(
      `${API_BASE_URL}/calendar?driver_id=${fixture.tenantA.driver.id}&from=${concurrentPayload.work_date}&to=${concurrentPayload.work_date}`,
      { headers: auth(tokenA.office) },
    );
    await expectStatus(concurrentCalendar, 200);
    expect((await concurrentCalendar.json() as Array<{ assignmentId: string }>).filter(
      (event) => event.assignmentId === concurrentAssignment.id,
    )).toHaveLength(1);
  });

  test('requests bind approval to JWT actor and create calendar days once', async ({ request }) => {
    const startDate = futureDay(430);
    const endDate = futureDay(431);
    await expectStatus(await request.post(`${API_BASE_URL}/requests`, {
      headers: auth(tokenA.office),
      data: { driverId: fixture.tenantB.driver.id, type: 'vacation', startDate, endDate },
    }), 404);
    const created = await request.post(`${API_BASE_URL}/requests`, {
      headers: auth(tokenA.office),
      data: { driverId: fixture.tenantA.driver.id, type: 'vacation', startDate, endDate, reason: 'P0 API' },
    });
    await expectStatus(created, 201);
    const leaveRequest = await created.json() as Entity;
    await expectStatus(await request.post(`${API_BASE_URL}/requests/${leaveRequest.id}/approve`, {
      headers: auth(tokenA.accounting), data: { currentUserId: fixture.tenantA.users.admin.id },
    }), 403);

    const approved = await request.post(`${API_BASE_URL}/requests/${leaveRequest.id}/approve`, {
      headers: auth(tokenA.office), data: { currentUserId: fixture.tenantA.users.admin.id },
    });
    await expectStatus(approved, 201);
    const approvedBody = await approved.json() as { approvedById: string; calendarEvents: Array<{ status: string }> };
    expect(approvedBody.approvedById).toBe(fixture.tenantA.users.office.id);
    expect(approvedBody.calendarEvents).toHaveLength(2);
    expect(approvedBody.calendarEvents.every((event) => event.status === 'UT')).toBe(true);
    await expectStatus(await request.post(`${API_BASE_URL}/requests/${leaveRequest.id}/approve`, {
      headers: auth(tokenA.office), data: {},
    }), 400);
  });

  test('leave decisions enforce write roles and are not repeatable', async ({ request }) => {
    const startDate = futureDay(440);
    const payload = {
      driver_id: fixture.tenantA.driver.id,
      type: 'sick_leave',
      start_date: startDate,
      end_date: startDate,
      reason: 'P0 leave decision',
    };
    await expectStatus(await request.post(`${API_BASE_URL}/leave-requests`, {
      headers: auth(tokenA.accounting), data: payload,
    }), 403);
    const created = await request.post(`${API_BASE_URL}/leave-requests`, {
      headers: auth(tokenA.office), data: payload,
    });
    await expectStatus(created, 201);
    const leaveRequest = await created.json() as Entity;
    const approved = await request.post(`${API_BASE_URL}/leave-requests/${leaveRequest.id}/approve`, {
      headers: auth(tokenA.boss), data: {},
    });
    await expectStatus(approved, 200);
    expect((await approved.json() as { calendarEvents: Array<{ status: string }> }).calendarEvents[0]?.status).toBe('KT');
    await expectStatus(await request.post(`${API_BASE_URL}/leave-requests/${leaveRequest.id}/reject`, {
      headers: auth(tokenA.boss), data: {},
    }), 400);
  });

  test('transport approval atomically creates one assignment and one AT event', async ({ request }) => {
    const requestedDate = futureDay(450);
    const payload = transportPayload(fixture.tenantA, requestedDate);
    await expectStatus(await request.post(`${API_BASE_URL}/transport-requests`, {
      headers: auth(tokenA.accounting), data: payload,
    }), 403);
    const foreignTransport = await request.post(`${API_BASE_URL}/transport-requests`, {
      headers: auth(tokenA.office), data: transportPayload(fixture.tenantB, requestedDate),
    });
    await expectStatus(foreignTransport, 404);
    expect(await foreignTransport.text()).not.toMatch(
      new RegExp(`${fixture.tenantB.driver.id}|${fixture.tenantB.vehicle.id}|${fixture.tenantB.company.id}`),
    );
    const afterForeignAttempt = await request.get(
      `${API_BASE_URL}/transport-requests?date=${requestedDate}`,
      { headers: auth(tokenA.office) },
    );
    await expectStatus(afterForeignAttempt, 200);
    expect((await afterForeignAttempt.json() as Array<{ driverId: string; vehicleId: string; companyId: string }>).some(
      (item) => item.driverId === fixture.tenantB.driver.id
        || item.vehicleId === fixture.tenantB.vehicle.id
        || item.companyId === fixture.tenantB.company.id,
    )).toBe(false);
    const created = await request.post(`${API_BASE_URL}/transport-requests`, {
      headers: auth(tokenA.office), data: payload,
    });
    await expectStatus(created, 201);
    const transportRequest = await created.json() as Entity;
    const approved = await request.post(`${API_BASE_URL}/transport-requests/${transportRequest.id}/approve`, {
      headers: auth(tokenA.office), data: {},
    });
    await expectStatus(approved, 200);
    const approvedBody = await approved.json() as {
      request: { status: string; assignmentId: string };
      assignment: Entity;
      calendarEvent: { assignmentId: string; status: string };
    };
    expect(approvedBody.request.status).toBe('approved');
    expect(approvedBody.request.assignmentId).toBe(approvedBody.assignment.id);
    expect(approvedBody.calendarEvent).toMatchObject({ assignmentId: approvedBody.assignment.id, status: 'AT' });
    await expectStatus(await request.post(`${API_BASE_URL}/transport-requests/${transportRequest.id}/approve`, {
      headers: auth(tokenA.office), data: {},
    }), 400);

    const tenantBRequest = await request.post(`${API_BASE_URL}/transport-requests`, {
      headers: auth(tokenB.office), data: transportPayload(fixture.tenantB, futureDay(451)),
    });
    await expectStatus(tenantBRequest, 201);
    const tenantBEntity = await tenantBRequest.json() as Entity;
    await expectStatus(await request.get(`${API_BASE_URL}/transport-requests/${tenantBEntity.id}`, {
      headers: auth(tokenA.admin),
    }), 404);
  });
});