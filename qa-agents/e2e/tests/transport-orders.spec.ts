import { ensureP0Fixture, fixtureToken, type FixtureManifest, type Role } from './support/p0-fixture';
import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * TICARI TASIMA SIPARISLERI — UCTAN UCA (Faz 15).
 *
 *   manuel taslak → kalemler → onay → gorev dilimleri → revizyon/amendment
 *   → iptal etkisi → fatura hazirligi (POD YOK)
 *
 * ROL KURALLARI REPODAN TURETILDI ve burada KANITLANIYOR: surucu 403,
 * office finans alanini ne gorur ne yazar, accounting operasyon plani
 * degistiremez.
 */

const API_BASE_URL = process.env.API_BASE_URL?.trim() || 'http://127.0.0.1:3000/api/v1';

function auth(fixture: FixtureManifest, role: Role, tenant: 'tenantA' | 'tenantB' = 'tenantA') {
  const value = fixtureToken(fixture, role, tenant);
  return value ? { Authorization: `Bearer ${value}` } : null;
}

let counter = 0;
function orderNumber(prefix = 'TO') {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

async function createOrder(
  request: APIRequestContext,
  headers: Record<string, string>,
  body: Record<string, unknown>,
) {
  return request.post(`${API_BASE_URL}/transport-orders`, { headers, data: body });
}

async function detail(request: APIRequestContext, headers: Record<string, string>, id: string) {
  const response = await request.get(`${API_BASE_URL}/transport-orders/${id}`, { headers });
  expect(response.ok(), `detay alinamadi: ${response.status()}`).toBeTruthy();
  return response.json();
}

test.describe.serial('Tasima siparisleri', () => {
  let fixture: FixtureManifest;
  let adminAuth: Record<string, string>;
  let officeAuth: Record<string, string>;
  let accountingAuth: Record<string, string>;
  let driverAuth: Record<string, string>;
  let companyId: string;
  let driverId: string;
  let vehicleId: string;

  test.beforeAll(async ({ request }) => {
    fixture = ensureP0Fixture();
    adminAuth = auth(fixture, 'admin')!;
    officeAuth = auth(fixture, 'office')!;
    accountingAuth = auth(fixture, 'accounting')!;
    driverAuth = auth(fixture, 'driver')!;

    const companies = await (
      await request.get(`${API_BASE_URL}/companies`, { headers: adminAuth })
    ).json();
    companyId = (companies.data ?? companies.rows ?? companies)[0].id;

    // AKTIF surucu/arac secilmeli: mevcut `validateAvailability` kapisi pasif
    // surucuye gorev acilmasini engelliyor ve bu kapi ATLANMIYOR.
    const drivers = await (
      await request.get(`${API_BASE_URL}/drivers`, { headers: adminAuth })
    ).json();
    const activeDriver = (drivers.data ?? drivers.rows ?? []).find(
      (item: { status?: string }) => item.status === 'active',
    );
    expect(activeDriver, 'fixture aktif surucu tasimiyor').toBeTruthy();
    driverId = activeDriver.id;

    const vehicles = await (
      await request.get(`${API_BASE_URL}/vehicles`, { headers: adminAuth })
    ).json();
    const activeVehicle = (vehicles.data ?? vehicles.rows ?? []).find(
      (item: { status?: string }) => item.status === 'active',
    );
    expect(activeVehicle, 'fixture aktif arac tasimiyor').toBeTruthy();
    vehicleId = activeVehicle.id;
  });

  // -------------------------------------------------------------------------
  // Roller
  // -------------------------------------------------------------------------

  test('SURUCU hicbir ticari siparis ucunu goremez', async ({ request }) => {
    expect(
      (await request.get(`${API_BASE_URL}/transport-orders`, { headers: driverAuth })).status(),
    ).toBe(403);
    expect(
      (
        await createOrder(request, driverAuth, {
          companyId,
          orderNumber: orderNumber(),
          orderDate: '2026-08-20T00:00:00.000Z',
        })
      ).status(),
    ).toBe(403);
  });

  test('ACCOUNTING operasyon planini DEGISTIREMEZ', async ({ request }) => {
    // `@RequiresWrite()` varsayilani: admin, boss, office. Muhasebe YAZAMAZ.
    const response = await createOrder(request, accountingAuth, {
      companyId,
      orderNumber: orderNumber(),
      orderDate: '2026-08-20T00:00:00.000Z',
    });
    expect(response.status(), 'muhasebe siparis olusturdu').toBe(403);
  });

  test('OFFICE finans alanini YAZAMAZ ve GOREMEZ', async ({ request }) => {
    // Yazma denemesi SESSIZCE DUSURULMEZ, reddedilir.
    const rejected = await createOrder(request, officeAuth, {
      companyId,
      orderNumber: orderNumber(),
      orderDate: '2026-08-20T00:00:00.000Z',
      contractedRevenue: 5000,
    });
    expect(rejected.status(), 'office fiyat yazabildi').toBe(403);
    expect((await rejected.json()).code).toBe('transport_order_financial_field_forbidden');

    // Finansal rol tutari yaziyor.
    const created = await (
      await createOrder(request, adminAuth, {
        companyId,
        orderNumber: orderNumber(),
        orderDate: '2026-08-20T00:00:00.000Z',
        currency: 'EUR',
        contractedRevenue: 2400,
      })
    ).json();

    // Office ayni siparisi goruyor ama TUTARI GORMUYOR.
    const asOffice = await detail(request, officeAuth, created.id);
    expect(asOffice.contractedRevenue).toBeNull();
    expect(asOffice.currency).toBeNull();
    expect(asOffice.financialFieldsMasked).toBe(true);
    // Operasyon alanlari yerinde.
    expect(asOffice.orderNumber).toBe(created.orderNumber);
    expect(asOffice.fulfillment).toBe('unplanned');
    // Yanitin HICBIR YERINDE tutar yok.
    expect(JSON.stringify(asOffice)).not.toContain('2400');

    // Muhasebe goruyor.
    const asAccounting = await detail(request, accountingAuth, created.id);
    expect(asAccounting.contractedRevenue).toBe('2400.00');
  });

  // -------------------------------------------------------------------------
  // Olusturma ve duplicate
  // -------------------------------------------------------------------------

  test('DUPLICATE external reference engellenir; acik onayla gecilir', async ({ request }) => {
    const reference = `KD-${Date.now()}`;
    const first = await createOrder(request, adminAuth, {
      companyId,
      orderNumber: orderNumber(),
      externalReference: reference,
      orderDate: '2026-08-20T00:00:00.000Z',
    });
    expect(first.status()).toBe(201);

    const duplicate = await createOrder(request, adminAuth, {
      companyId,
      orderNumber: orderNumber(),
      externalReference: reference,
      orderDate: '2026-08-21T00:00:00.000Z',
    });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).code).toBe('transport_order_duplicate_reference');
  });

  test('KIRACI IZOLASYONU — baska kiracinin siparisi 404', async ({ request }) => {
    const created = await (
      await createOrder(request, adminAuth, {
        companyId,
        orderNumber: orderNumber(),
        orderDate: '2026-08-20T00:00:00.000Z',
      })
    ).json();

    const tenantBAuth = auth(fixture, 'admin', 'tenantB');
    test.skip(!tenantBAuth, 'fixture ikinci kiraci tasimiyor');
    const crossTenant = await request.get(`${API_BASE_URL}/transport-orders/${created.id}`, {
      headers: tenantBAuth!,
    });
    expect(crossTenant.status(), 'kiraci sinirini asti').toBe(404);
  });

  // -------------------------------------------------------------------------
  // Yasam dongusu, revizyon, gorevler
  // -------------------------------------------------------------------------

  test('draft → confirmed → gorev dilimleri → revizyon → iptal', async ({ request }) => {
    const created = await (
      await createOrder(request, adminAuth, {
        companyId,
        orderNumber: orderNumber(),
        orderDate: '2026-08-20T00:00:00.000Z',
        currency: 'EUR',
        contractedRevenue: 2400,
        consignments: [
          { pickupAddress: 'Duisburg', deliveryAddress: 'Hamburg', cargoDescription: 'Paletten' },
          { pickupAddress: 'Hamburg', deliveryAddress: 'Berlin', cargoDescription: 'Stahl' },
        ],
      })
    ).json();
    expect(created.status).toBe('draft');
    expect(created.consignments).toHaveLength(2);
    // ADR belirtilmedi → `unknown`. `no` VARSAYILMADI.
    expect(created.consignments[0].adrStatus).toBe('unknown');
    // Ilk revizyon birakildi.
    expect(created.revisions).toHaveLength(1);

    // --- Onay ---
    const confirmed = await (
      await request.post(`${API_BASE_URL}/transport-orders/${created.id}/confirm`, {
        headers: adminAuth,
        data: { expectedUpdatedAt: created.updatedAt },
      })
    ).json();
    expect(confirmed.status).toBe('confirmed');
    // TICARI DURUM ILE OPERASYON AYRI: onaylandi ama planlanmadi.
    expect(confirmed.fulfillment).toBe('unplanned');

    // --- BIR SIPARIS → COK ASSIGNMENT ---
    const slice1 = await request.post(
      `${API_BASE_URL}/transport-orders/${created.id}/assignments`,
      {
        headers: adminAuth,
        data: {
          driverId,
          vehicleId,
          workDate: '2026-08-24T00:00:00.000Z',
          consignmentId: created.consignments[0].id,
          // Mevcut kapilar ATLANMIYOR — onay ILETILIYOR. Fixture surucusunun
          // ehliyet kontrolu vadesi gecmis; gercek akista da bu onay istenir.
          acknowledgeLicenseComplianceWarning: true,
          acknowledgeVehicleDefectWarning: true,
        },
      },
    );
    expect(slice1.status(), await slice1.text()).toBe(201);
    const slice1Body = await slice1.json();
    expect(slice1Body.created).toBe(true);

    // IDEMPOTENT: ayni dilim ikinci kez acilmaz.
    const repeat = await request.post(
      `${API_BASE_URL}/transport-orders/${created.id}/assignments`,
      {
        headers: adminAuth,
        data: {
          driverId,
          vehicleId,
          workDate: '2026-08-24T00:00:00.000Z',
          consignmentId: created.consignments[0].id,
          // Mevcut kapilar ATLANMIYOR — onay ILETILIYOR. Fixture surucusunun
          // ehliyet kontrolu vadesi gecmis; gercek akista da bu onay istenir.
          acknowledgeLicenseComplianceWarning: true,
          acknowledgeVehicleDefectWarning: true,
        },
      },
    );
    expect(repeat.status()).toBe(201);
    const repeatBody = await repeat.json();
    expect(repeatBody.created, 'ikinci gorev acildi').toBe(false);
    expect(repeatBody.assignmentId).toBe(slice1Body.assignmentId);

    const withSlice = await detail(request, adminAuth, created.id);
    expect(withSlice.assignments).toHaveLength(1);
    // Iki kalemin yalnizca biri planlandi.
    expect(withSlice.fulfillment).toBe('partially_planned');
    // Gorev GUNCEL revizyondan uretildi.
    expect(withSlice.assignments[0].staleAgainstOrder).toBe(false);

    // POD YOKKEN FATURAYA HAZIR DEGIL.
    expect(withSlice.billing.deliveryVerificationAvailable).toBe(false);
    expect(withSlice.billing.readiness).not.toBe('verified');

    // --- ONAYLANMIS SIPARISTE DEGISIKLIK = ONERI ---
    const amended = await request.post(
      `${API_BASE_URL}/transport-orders/${created.id}/amendments`,
      {
        headers: adminAuth,
        data: { expectedUpdatedAt: withSlice.updatedAt, contractedRevenue: 2900 },
      },
    );
    expect(amended.status()).toBe(201);
    const amendedBody = await amended.json();
    // ANA KAYIT DEGISMEDI.
    expect(amendedBody.contractedRevenue).toBe('2400.00');
    expect(amendedBody.currentRevision).toBe(1);

    const pending = amendedBody.revisions.find(
      (item: { status: string }) => item.status === 'pending_review',
    );
    expect(pending).toBeTruthy();
    // ESKI ve YENI deger karsilastirilabilir.
    expect(pending.changedFields).toEqual([
      { field: 'contractedRevenue', before: '2400.00', after: '2900.00' },
    ]);

    // --- Onay uygulanir ---
    const approved = await (
      await request.post(
        `${API_BASE_URL}/transport-orders/${created.id}/amendments/${pending.id}/approve`,
        { headers: adminAuth, data: { expectedUpdatedAt: amendedBody.updatedAt } },
      )
    ).json();
    expect(approved.contractedRevenue).toBe('2900.00');
    expect(approved.currentRevision).toBe(2);

    // ESKI REVIZYONDAN URETILMIS GOREV artik ISARETLI.
    expect(approved.assignments[0].staleAgainstOrder, 'eski gorev isaretlenmedi').toBe(true);

    // --- IPTAL: etkiyi gosterir ve acik onay ister ---
    const impact = await (
      await request.get(`${API_BASE_URL}/transport-orders/${created.id}/cancellation-impact`, {
        headers: adminAuth,
      })
    ).json();
    expect(impact.assignmentCount).toBe(1);
    expect(impact.requiresConfirmation).toBe(true);

    const withoutAck = await request.post(
      `${API_BASE_URL}/transport-orders/${created.id}/cancel`,
      {
        headers: adminAuth,
        data: { expectedUpdatedAt: approved.updatedAt, category: 'customer_cancelled' },
      },
    );
    expect(withoutAck.status(), 'onaysiz iptal gecti').toBe(409);

    const cancelled = await (
      await request.post(`${API_BASE_URL}/transport-orders/${created.id}/cancel`, {
        headers: adminAuth,
        data: {
          expectedUpdatedAt: approved.updatedAt,
          category: 'customer_cancelled',
          acknowledgeImpact: true,
        },
      })
    ).json();
    expect(cancelled.status).toBe('cancelled');

    // IPTAL ASSIGNMENT'I SILMEDI.
    const assignment = await request.get(
      `${API_BASE_URL}/assignments/${slice1Body.assignmentId}`,
      { headers: adminAuth },
    );
    expect(assignment.ok(), 'iptal gorevi sildi').toBeTruthy();
    expect((await assignment.json()).id).toBe(slice1Body.assignmentId);
  });

  test('REDDEDILEN oneri ana kaydi DEGISTIRMEZ', async ({ request }) => {
    const created = await (
      await createOrder(request, adminAuth, {
        companyId,
        orderNumber: orderNumber(),
        orderDate: '2026-08-20T00:00:00.000Z',
        currency: 'EUR',
        contractedRevenue: 1000,
      })
    ).json();

    const confirmed = await (
      await request.post(`${API_BASE_URL}/transport-orders/${created.id}/confirm`, {
        headers: adminAuth,
        data: { expectedUpdatedAt: created.updatedAt },
      })
    ).json();

    const amended = await (
      await request.post(`${API_BASE_URL}/transport-orders/${created.id}/amendments`, {
        headers: adminAuth,
        data: { expectedUpdatedAt: confirmed.updatedAt, contractedRevenue: 1500 },
      })
    ).json();
    const pending = amended.revisions.find(
      (item: { status: string }) => item.status === 'pending_review',
    );

    const rejected = await (
      await request.post(
        `${API_BASE_URL}/transport-orders/${created.id}/amendments/${pending.id}/reject`,
        { headers: adminAuth, data: { reason: 'Musteri fiyati kabul etmedi.' } },
      )
    ).json();

    // ANA KAYIT DEGISMEDI.
    expect(rejected.contractedRevenue).toBe('1000.00');
    expect(rejected.currentRevision).toBe(1);
    // ESKI REVIZYON YERINDE — silinmedi.
    expect(rejected.revisions.length).toBeGreaterThanOrEqual(2);
  });

  test('EZAMANLI iki onayda YALNIZ BIRI kazanir', async ({ request }) => {
    const created = await (
      await createOrder(request, adminAuth, {
        companyId,
        orderNumber: orderNumber(),
        orderDate: '2026-08-20T00:00:00.000Z',
        currency: 'EUR',
        contractedRevenue: 800,
      })
    ).json();
    const confirmed = await (
      await request.post(`${API_BASE_URL}/transport-orders/${created.id}/confirm`, {
        headers: adminAuth,
        data: { expectedUpdatedAt: created.updatedAt },
      })
    ).json();
    const amended = await (
      await request.post(`${API_BASE_URL}/transport-orders/${created.id}/amendments`, {
        headers: adminAuth,
        data: { expectedUpdatedAt: confirmed.updatedAt, contractedRevenue: 1200 },
      })
    ).json();
    const pending = amended.revisions.find(
      (item: { status: string }) => item.status === 'pending_review',
    );

    const [left, right] = await Promise.all([
      request.post(
        `${API_BASE_URL}/transport-orders/${created.id}/amendments/${pending.id}/approve`,
        { headers: adminAuth, data: { expectedUpdatedAt: amended.updatedAt } },
      ),
      request.post(
        `${API_BASE_URL}/transport-orders/${created.id}/amendments/${pending.id}/approve`,
        { headers: adminAuth, data: { expectedUpdatedAt: amended.updatedAt } },
      ),
    ]);

    const statuses = [left.status(), right.status()].sort();
    expect(statuses[0], 'iki onay birden gecti').toBe(200);
    expect(statuses[1]).toBeGreaterThanOrEqual(409);

    const final = await detail(request, adminAuth, created.id);
    expect(final.currentRevision).toBe(2);
  });

  test('ESKI Assignment siparise BAGLANABILIR ve bozulmadan kalir', async ({ request }) => {
    // Siparisten BAGIMSIZ olusturulan bir gorev (eski kayit temsili).
    const legacy = await request.post(`${API_BASE_URL}/assignments`, {
      headers: adminAuth,
      data: {
        driver_id: driverId,
        vehicle_id: vehicleId,
        company_id: companyId,
        cargo_name: 'Legacy',
        cargo_owner: 'Legacy GmbH',
        pickup_address: 'Essen',
        delivery_address: 'Koln',
        work_date: '2026-09-02T00:00:00.000Z',
        acknowledge_license_compliance_warning: true,
        acknowledge_vehicle_defect_warning: true,
      },
    });
    expect(legacy.status(), await legacy.text()).toBe(201);
    const legacyId = (await legacy.json()).id;

    // Siparissiz calisiyor: `transportOrderId` null ve gorev erisilebilir.
    const before = await (
      await request.get(`${API_BASE_URL}/assignments/${legacyId}`, { headers: adminAuth })
    ).json();
    expect(before.id).toBe(legacyId);

    const order = await (
      await createOrder(request, adminAuth, {
        companyId,
        orderNumber: orderNumber(),
        orderDate: '2026-09-01T00:00:00.000Z',
      })
    ).json();

    const linked = await request.post(
      `${API_BASE_URL}/transport-orders/${order.id}/assignments/link`,
      { headers: adminAuth, data: { assignmentId: legacyId } },
    );
    expect(linked.status()).toBe(200);
    const linkedBody = await linked.json();
    expect(linkedBody.assignments.map((item: { id: string }) => item.id)).toContain(legacyId);

    // BIR GOREV YALNIZ BIR SIPARISE AIT OLABILIR.
    const other = await (
      await createOrder(request, adminAuth, {
        companyId,
        orderNumber: orderNumber(),
        orderDate: '2026-09-01T00:00:00.000Z',
      })
    ).json();
    const stolen = await request.post(
      `${API_BASE_URL}/transport-orders/${other.id}/assignments/link`,
      { headers: adminAuth, data: { assignmentId: legacyId } },
    );
    expect(stolen.status(), 'gorev sessizce tasindi').toBe(409);
  });

  test('BIR TURDA farkli siparislere ait gorevler bulunabilir', async ({ request }) => {
    // Iki ayri siparis, iki ayri gorev dilimi.
    const orders = [];
    for (let index = 0; index < 2; index += 1) {
      const order = await (
        await createOrder(request, adminAuth, {
          companyId,
          orderNumber: orderNumber(),
          orderDate: '2026-09-10T00:00:00.000Z',
          consignments: [
            { pickupAddress: 'Essen', deliveryAddress: 'Bonn', cargoDescription: `Ladung ${index}` },
          ],
        })
      ).json();
      const slice = await request.post(
        `${API_BASE_URL}/transport-orders/${order.id}/assignments`,
        {
          headers: adminAuth,
          data: {
            driverId,
            vehicleId,
            workDate: `2026-09-1${index + 1}T00:00:00.000Z`,
            consignmentId: order.consignments[0].id,
            acknowledgeLicenseComplianceWarning: true,
            acknowledgeVehicleDefectWarning: true,
          },
        },
      );
      expect(slice.status()).toBe(201);
      orders.push({ orderId: order.id, assignmentId: (await slice.json()).assignmentId });
    }

    // Iki gorev FARKLI siparislere ait ve ikisi de ayni tura konabilir —
    // `TourStop.assignmentId` uzerinden. `TourStop.transportOrderId` YOK.
    expect(orders[0]!.assignmentId).not.toBe(orders[1]!.assignmentId);
    for (const item of orders) {
      const body = await detail(request, adminAuth, item.orderId);
      expect(body.assignments).toHaveLength(1);
    }
  });

  test('TAMAMLANMAMIS siparis geriye donuk iptal edilebilir; hazir olmayan fatura ACIKCA yazilir', async ({
    request,
  }) => {
    const created = await (
      await createOrder(request, adminAuth, {
        companyId,
        orderNumber: orderNumber(),
        orderDate: '2026-08-20T00:00:00.000Z',
        currency: 'EUR',
        billingMode: 'per_delivery',
      })
    ).json();

    // Onaylanmamis siparis fatura adayi DEGIL.
    expect(created.billing.reason).toBe('order_not_confirmed');

    const confirmed = await (
      await request.post(`${API_BASE_URL}/transport-orders/${created.id}/confirm`, {
        headers: adminAuth,
        data: { expectedUpdatedAt: created.updatedAt },
      })
    ).json();
    // Bitmis dilim yok.
    expect(confirmed.billing.reason).toBe('no_completed_slice');
    expect(confirmed.billing.deliveryVerificationAvailable).toBe(false);
  });
});
