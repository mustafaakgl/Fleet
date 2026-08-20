import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { DispatchApprovalService } from './dispatch-approval.service';

type Row = Record<string, unknown>;

/**
 * ATOMIK DISPATCH ONAYI (Faz 17d).
 *
 * Prisma MOCK ama TRANSACTION SEMANTIGI GERCEKTEN taklit ediliyor: `$transaction`
 * govdesi hata firlatirsa o islem icinde yazilan HER SEY geri aliniyor. Bu
 * olmadan "Assignment olusup Tour olusmuyorsa tam rollback" iddiasi hicbir sey
 * kanitlamazdi — asil kural zaten veritabaninda.
 *
 * `AssignmentsService` ve `TourService` de mock, ama CAGRILDIKLARI kaydediliyor:
 * "dogrudan Prisma'ya yazmiyoruz, mevcut servislerden geciyoruz" iddiasi ancak
 * boyle olculebilir.
 */

const NOW = new Date('2026-09-01T08:00:00.000Z');
const EXPECTED = NOW.toISOString();

interface BuildOptions {
  status?: string;
  generation?: string;
  orderStatus?: string;
  currentRevision?: number;
  resultTourId?: string | null;
  vehicleStatus?: string;
  driverStatus?: string;
  vehicleConflicts?: number;
  driverConflicts?: number;
  adrCertified?: boolean | null;
  adrDemand?: string;
  payloadCapacityKg?: number | null;
  tourThrows?: boolean;
  consignmentCount?: number;
  withoutWindows?: boolean;
}

function build(options: BuildOptions = {}) {
  const proposals: Row[] = [
    {
      id: 'dp-1',
      status: options.status ?? 'open',
      generation: options.generation ?? 'ready',
      proposalId: 'prop-1',
      resultTourId: options.resultTourId ?? null,
      jobAttempt: 1,
      computedAt: NOW,
      updatedAt: NOW,
      activeFingerprint: 'fp-1',
    },
  ];
  const proposalOrders: Row[] = [
    { dispatchProposalId: 'dp-1', transportOrderId: 'ord-1', sourceRevision: 3 },
  ];
  const consignments = Array.from({ length: options.consignmentCount ?? 2 }, (_item, index) => ({
    id: `con-${index + 1}`,
    cargoDescription: `Ladung ${index + 1}`,
    pickupAddress: 'Duisburg',
    deliveryAddress: 'Hamburg',
    pickupLocationId: null,
    deliveryLocationId: null,
    weightKg: 1000,
    volumeM3: 5,
    palletCount: 4,
    adrStatus: options.adrDemand ?? 'no',
    // ZAMAN PENCERESI VAR: penceresiz siparis motorda `explicit_choice`
    // uretiyor (pencere yoklugu "kisit yok" demek degil) ve o davranis
    // asagida AYRI bir testle dogrulaniyor.
    pickupWindowStart: options.withoutWindows ? null : new Date('2026-09-01T06:00:00.000Z'),
    pickupWindowEnd: options.withoutWindows ? null : new Date('2026-09-01T10:00:00.000Z'),
    deliveryWindowStart: options.withoutWindows ? null : new Date('2026-09-01T14:00:00.000Z'),
    deliveryWindowEnd: options.withoutWindows ? null : new Date('2026-09-01T18:00:00.000Z'),
  }));
  const orders: Row[] = [
    {
      id: 'ord-1',
      status: options.orderStatus ?? 'confirmed',
      currentRevision: options.currentRevision ?? 3,
      companyId: 'cmp-1',
      consignments,
    },
  ];
  const assignments: Row[] = [];
  const tours: Row[] = [];
  const approvalTasks: Row[] = [{ proposalId: 'prop-1', status: 'open' }];
  const overrides: Row[] = [];
  const audits: Row[] = [];
  const calls: string[] = [];
  let seq = 0;

  /** Islem icinde yazilanlari geri almak icin anlik goruntu. */
  const snapshot = () => ({
    proposals: proposals.map((row) => ({ ...row })),
    assignments: assignments.length,
    tours: tours.length,
    approvalTasks: approvalTasks.map((row) => ({ ...row })),
    overrides: overrides.length,
  });
  const restore = (snap: ReturnType<typeof snapshot>) => {
    proposals.splice(0, proposals.length, ...snap.proposals);
    assignments.length = snap.assignments;
    tours.length = snap.tours;
    approvalTasks.splice(0, approvalTasks.length, ...snap.approvalTasks);
    overrides.length = snap.overrides;
  };

  const client = {
    dispatchProposal: {
      async findFirst({ where }: { where: Row }) {
        const row = proposals.find((item) => item.id === where.id);
        if (!row) return null;
        return { ...row, orders: proposalOrders.filter((o) => o.dispatchProposalId === row.id) };
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of proposals) {
          if (row.id !== where.id) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          if (where.generation !== undefined && row.generation !== where.generation) continue;
          if ('resultTourId' in where && row.resultTourId !== where.resultTourId) continue;
          if (where.updatedAt !== undefined) {
            const expected = where.updatedAt as Date;
            if ((row.updatedAt as Date).getTime() !== expected.getTime()) continue;
          }
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    transportOrder: {
      async findMany() {
        return orders;
      },
    },
    assignment: {
      async findMany() {
        return assignments;
      },
      async count({ where }: { where: Row }) {
        return where.vehicleId ? (options.vehicleConflicts ?? 0) : (options.driverConflicts ?? 0);
      },
    },
    tour: {
      async count() {
        return 0;
      },
    },
    calendarEvent: {
      async findFirst() {
        return null;
      },
    },
    vehicle: {
      async findFirst() {
        return {
          id: 'veh-1',
          status: options.vehicleStatus ?? 'active',
          payloadCapacityKg:
            options.payloadCapacityKg === undefined ? 12_000 : options.payloadCapacityKg,
          cargoVolumeM3: 60,
          palletCapacity: 33,
          adrCertified: options.adrCertified === undefined ? true : options.adrCertified,
          tuvExpiryDate: new Date('2027-01-01'),
          insuranceExpiryDate: new Date('2027-01-01'),
        };
      },
    },
    driver: {
      async findFirst() {
        return {
          id: 'drv-1',
          status: options.driverStatus ?? 'active',
          licenseExpiryDate: new Date('2027-01-01'),
        };
      },
    },
    approvalTask: {
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of approvalTasks) {
          if (row.proposalId !== where.proposalId) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    dispatchOverrideDeclaration: {
      async create({ data }: { data: Row }) {
        const row = { id: `ovr-${(seq += 1)}`, ...data };
        overrides.push(row);
        return row;
      },
    },
  };

  const prisma = {
    ...client,
    /** GERCEK ROLLBACK: govde patlarsa islem icinde yazilan her sey geri alinir. */
    async $transaction<T>(body: (tx: typeof client) => Promise<T>): Promise<T> {
      const snap = snapshot();
      try {
        return await body(client);
      } catch (error) {
        restore(snap);
        throw error;
      }
    },
  };

  const assignmentsService = {
    async create(_dto: Row, _userId: string, tx: unknown) {
      calls.push('assignments.create');
      // ISLEME KATILDIGINI kanitla: tx verilmemisse atomiklik yok demektir.
      assert.ok(tx, 'AssignmentsService.create dis transaction almadi');
      const row = { id: `asg-${(seq += 1)}` };
      assignments.push(row);
      return row;
    },
  };

  const tourService = {
    async createFromAssignments(_params: Row, tx: unknown) {
      calls.push('tours.createFromAssignments');
      assert.ok(tx, 'TourService.createFromAssignments dis transaction almadi');
      if (options.tourThrows) {
        throw new Error('valhalla patladi');
      }
      const row = { id: `tour-${(seq += 1)}` };
      tours.push(row);
      return row;
    },
  };

  const audit = { async logAction(entry: Row) { audits.push(entry); return {}; } };

  const service = new DispatchApprovalService(
    prisma as never,
    audit as never,
    assignmentsService as never,
    tourService as never,
  );

  return { service, proposals, assignments, tours, approvalTasks, overrides, audits, calls };
}

/** Beyanin gecerli olmasi icin gereken TAM kapsam. */
const SCOPE = {
  dispatchProposalId: 'dp-1',
  driverId: 'drv-1',
  vehicleId: 'veh-1',
  workDate: '2026-09-01',
  proposalRevision: 1,
};

/**
 * TAKOGRAF BEYANI HER ONAYDA GEREKLI.
 *
 * Repoda kanonik "kalan surus suresi" alani YOK, dolayisiyla
 * `driver_drive_time` DAIMA `unknown` ve hicbir plan `direct` olarak
 * uygulanamaz. Bu bir test kolayligi degil, SISTEMIN GERCEK HALI: takograf
 * verisi baglanana kadar her dispatch bir insan beyani gerektiriyor ve o
 * beyan kim/ne zaman/ne dedi olarak kaydediliyor.
 */
const TACHO_OVERRIDE = {
  code: 'driver_drive_time',
  note: 'surucu kartini elle okudum, 6 saat kaldi',
  scope: SCOPE,
};

const APPROVE = {
  vehicleId: 'veh-1',
  driverId: 'drv-1',
  expectedUpdatedAt: EXPECTED,
  overrides: [TACHO_OVERRIDE],
};

// ---------------------------------------------------------------------------
// Basarili yol
// ---------------------------------------------------------------------------

describe('Basarili cok kalemli plan', () => {
  it('TEK TUR ve her kalem icin bir gorev olusuyor', async () => {
    const harness = build({ consignmentCount: 3 });
    const result = await harness.service.approve('user-1', 'office', 'dp-1', APPROVE);

    assert.equal(harness.tours.length, 1);
    assert.equal(harness.assignments.length, 3);
    assert.equal(result.assignmentIds.length, 3);
    // Takograf beyani gerektigi icin mod DAIMA `manual_override`.
    assert.equal(result.mode, 'manual_override');
  });

  it('DOGRUDAN PRISMA YAZILMIYOR — mevcut servisler cagriliyor', async () => {
    const harness = build({ consignmentCount: 2 });
    await harness.service.approve('user-1', 'admin', 'dp-1', APPROVE);
    assert.deepEqual(harness.calls, [
      'assignments.create',
      'assignments.create',
      'tours.createFromAssignments',
    ]);
  });

  it('sonuc baglaniyor ve oneri karara baglaniyor', async () => {
    const harness = build();
    const result = await harness.service.approve('user-1', 'office', 'dp-1', APPROVE);
    assert.equal(harness.proposals[0]!.resultTourId, result.tourId);
    assert.equal(harness.proposals[0]!.status, 'approved');
    // Yeniden planlanabilsin diye aktif parmak izi birakiliyor.
    assert.equal(harness.proposals[0]!.activeFingerprint, null);
  });

  it('inceleme gorevi kapaniyor ve denetim yaziliyor', async () => {
    const harness = build();
    await harness.service.approve('user-1', 'office', 'dp-1', APPROVE);
    assert.equal(harness.approvalTasks[0]!.status, 'decided');
    assert.equal(harness.audits.length, 1);
    // Adres ve ad denetime GIRMIYOR.
    assert.equal(JSON.stringify(harness.audits).includes('Duisburg'), false);
  });
});

// ---------------------------------------------------------------------------
// Canli veri kontrolleri
// ---------------------------------------------------------------------------

describe('Onay aninda canli veri yeniden okunuyor', () => {
  it('BAYAT sourceRevision reddediliyor', async () => {
    const harness = build({ currentRevision: 4 });
    await assert.rejects(
      () => harness.service.approve('user-1', 'office', 'dp-1', APPROVE),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.assignments.length, 0);
    assert.equal(harness.tours.length, 0);
  });

  it('IPTAL ve TASLAK siparis uygulanamaz', async () => {
    for (const status of ['cancelled', 'draft']) {
      const harness = build({ orderStatus: status });
      await assert.rejects(
        () => harness.service.approve('user-1', 'office', 'dp-1', APPROVE),
        (error: unknown) => error instanceof ConflictException,
        status,
      );
      assert.equal(harness.assignments.length, 0, status);
    }
  });

  it('ONAY ANINDA olusan arac cakismasi plani durduruyor', async () => {
    const harness = build({ vehicleConflicts: 1 });
    await assert.rejects(
      () => harness.service.approve('user-1', 'office', 'dp-1', APPROVE),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.tours.length, 0);
  });

  it('ONAY ANINDA izne cikan surucu plani durduruyor', async () => {
    const harness = build({ driverStatus: 'on_leave' });
    await assert.rejects(
      () => harness.service.approve('user-1', 'office', 'dp-1', APPROVE),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.assignments.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Kararlar ve override
// ---------------------------------------------------------------------------

describe('Karar kurallari', () => {
  it('BLOCKED aday hicbir rolle uygulanamaz', async () => {
    for (const role of ['office', 'boss', 'admin']) {
      const harness = build({ vehicleStatus: 'maintenance' });
      await assert.rejects(
        () => harness.service.approve('user-1', role, 'dp-1', APPROVE),
        (error: unknown) => error instanceof ConflictException,
        role,
      );
      assert.equal(harness.tours.length, 0, role);
    }
  });

  it('BLOCKED aday BEYANLA da gecilemez', async () => {
    const harness = build({ vehicleStatus: 'broken' });
    await assert.rejects(
      () =>
        harness.service.approve('user-1', 'admin', 'dp-1', {
          ...APPROVE,
          overrides: [TACHO_OVERRIDE, { code: 'vehicle_available', note: 'atolye hazir dedi', scope: SCOPE }],
        }),
      (error: unknown) => error instanceof ConflictException,
    );
  });

  it('review_required GECERSIZ beyanla uygulanamaz', async () => {
    // Kapasite bilinmiyor -> politika `none`, beyan kabul edilmez.
    const harness = build({ payloadCapacityKg: null });
    await assert.rejects(
      () =>
        harness.service.approve('user-1', 'office', 'dp-1', {
          ...APPROVE,
          overrides: [TACHO_OVERRIDE, { code: 'vehicle_capacity_weight', note: 'gozle baktim sigar', scope: SCOPE }],
        }),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.assignments.length, 0);
  });

  it('review_required GECERLI ve KAPSAMLI beyanla uygulanabilir', async () => {
    // Yuk ADR belirsiz + arac belgeli -> `explicit_choice`.
    const harness = build({ adrDemand: 'unknown', adrCertified: true });
    const result = await harness.service.approve('user-1', 'office', 'dp-1', {
      ...APPROVE,
      overrides: [TACHO_OVERRIDE, { code: 'vehicle_adr', answer: 'no', scope: SCOPE }],
    });
    assert.equal(result.mode, 'manual_override');
    assert.equal(harness.tours.length, 1);
    // BEYAN KAYDEDILIYOR: kim neyi ustlendi.
    // Iki beyan da kaydediliyor: takograf ve ADR.
    assert.equal(harness.overrides.length, 2);
    assert.ok(harness.overrides.every((row) => row.declaredById === 'user-1'));
  });

  it('KAPSAM DISI beyan onay aninda da gecersiz', async () => {
    const harness = build({ adrDemand: 'unknown', adrCertified: true });
    await assert.rejects(
      () =>
        harness.service.approve('user-1', 'office', 'dp-1', {
          ...APPROVE,
          overrides: [
            TACHO_OVERRIDE,
            // BASKA GUNE ait beyan.
            { code: 'vehicle_adr', answer: 'no', scope: { ...SCOPE, workDate: '2026-09-05' } },
          ],
        }),
      (error: unknown) => error instanceof ConflictException,
    );
  });

  it('MUHASEBE ve SURUCU onaylayamaz', async () => {
    for (const role of ['accounting', 'driver', 'customer', null]) {
      const harness = build();
      await assert.rejects(
        () => harness.service.approve('user-1', role, 'dp-1', APPROVE),
        (error: unknown) => error instanceof ForbiddenException,
        String(role),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Exactly-once ve rollback
// ---------------------------------------------------------------------------

describe('Takograf beyani ZORUNLU', () => {
  it('BEYANSIZ onay uygulanamaz — kanonik veri yok', async () => {
    const harness = build();
    await assert.rejects(
      () =>
        harness.service.approve('user-1', 'office', 'dp-1', {
          vehicleId: 'veh-1',
          driverId: 'drv-1',
          expectedUpdatedAt: EXPECTED,
        }),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.tours.length, 0);
  });

  it('beyan KAYDEDILIYOR: kim, ne zaman, ne dedi', async () => {
    const harness = build();
    await harness.service.approve('user-1', 'office', 'dp-1', APPROVE);
    const record = harness.overrides[0]!;
    assert.equal(record.checkCode, 'driver_drive_time');
    assert.equal(record.declaredById, 'user-1');
    assert.equal(record.driverId, 'drv-1');
    assert.equal(record.vehicleId, 'veh-1');
    assert.match(String(record.note), /kartini elle okudum/);
  });
});

describe('Zaman penceresi olmayan siparis', () => {
  it('ACIK SECIM istiyor — "pencere yok" sessizce "kisit yok" sayilmiyor', async () => {
    const harness = build({ withoutWindows: true });
    await assert.rejects(
      () => harness.service.approve('user-1', 'office', 'dp-1', APPROVE),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.tours.length, 0);
  });

  it('acik secimle uygulanabiliyor', async () => {
    const harness = build({ withoutWindows: true });
    const result = await harness.service.approve('user-1', 'office', 'dp-1', {
      ...APPROVE,
      overrides: [TACHO_OVERRIDE, { code: 'time_windows', answer: 'no', scope: SCOPE }],
    });
    assert.equal(result.mode, 'manual_override');
    assert.equal(harness.tours.length, 1);
  });
});

describe('Exactly-once', () => {
  it('ESZAMANLI CIFT ONAYDAN yalnizca biri domain kaydi olusturur', async () => {
    const harness = build();
    const [first, second] = await Promise.allSettled([
      harness.service.approve('user-1', 'office', 'dp-1', APPROVE),
      harness.service.approve('user-2', 'office', 'dp-1', APPROVE),
    ]);

    const fulfilled = [first, second].filter((item) => item.status === 'fulfilled');
    assert.equal(fulfilled.length, 1);
    assert.equal(harness.tours.length, 1);
  });

  it('TEKRARLANAN onay mevcut sonucu doner, ikinci tur ACMAZ', async () => {
    const harness = build();
    const first = await harness.service.approve('user-1', 'office', 'dp-1', APPROVE);
    const second = await harness.service.approve('user-1', 'office', 'dp-1', APPROVE);

    assert.equal(second.repeated, true);
    assert.equal(second.tourId, first.tourId);
    assert.equal(harness.tours.length, 1);
  });

  it('BAYAT updatedAt damgasi reddediliyor', async () => {
    const harness = build();
    await assert.rejects(
      () =>
        harness.service.approve('user-1', 'office', 'dp-1', {
          ...APPROVE,
          expectedUpdatedAt: '2020-01-01T00:00:00.000Z',
        }),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.tours.length, 0);
  });

  it('gecersiz damga bicimi reddediliyor', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.service.approve('user-1', 'office', 'dp-1', { ...APPROVE, expectedUpdatedAt: 'yakinda' }),
      (error: unknown) => error instanceof BadRequestException,
    );
  });
});

describe('TAM ROLLBACK', () => {
  it('Tour hatasinda gorevler de geri aliniyor', async () => {
    const harness = build({ tourThrows: true, consignmentCount: 2 });
    await assert.rejects(() => harness.service.approve('user-1', 'office', 'dp-1', APPROVE));

    // Gorevler olusturulmustu ama islem geri alindi.
    assert.deepEqual(harness.calls, [
      'assignments.create',
      'assignments.create',
      'tours.createFromAssignments',
    ]);
    assert.equal(harness.assignments.length, 0, 'gorevler geri alinmadi');
    assert.equal(harness.tours.length, 0);
    // Oneri de karara baglanmis KALMIYOR.
    assert.equal(harness.proposals[0]!.status, 'open');
    assert.equal(harness.proposals[0]!.resultTourId, null);
  });

  it('kalemsiz plan bos tur ACMAZ', async () => {
    const harness = build({ consignmentCount: 0 });
    await assert.rejects(
      () => harness.service.approve('user-1', 'office', 'dp-1', APPROVE),
      (error: unknown) => error instanceof BadRequestException,
    );
    assert.equal(harness.tours.length, 0);
    assert.equal(harness.proposals[0]!.status, 'open');
  });
});

// ---------------------------------------------------------------------------
// Red
// ---------------------------------------------------------------------------

describe('Red', () => {
  it('HICBIR domain kaydi olusmuyor', async () => {
    const harness = build();
    await harness.service.reject('user-1', 'office', 'dp-1', 'arac bulunamadi');
    assert.equal(harness.assignments.length, 0);
    assert.equal(harness.tours.length, 0);
    assert.deepEqual(harness.calls, []);
    assert.equal(harness.proposals[0]!.status, 'rejected');
  });

  it('SEBEPSIZ red reddediliyor', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.service.reject('user-1', 'office', 'dp-1', 'x'),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it('MUHASEBE reddedemez', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.service.reject('user-1', 'accounting', 'dp-1', 'gecerli bir sebep'),
      (error: unknown) => error instanceof ForbiddenException,
    );
  });

  it('karara baglanmis oneri yeniden reddedilemez', async () => {
    const harness = build({ status: 'approved' });
    await assert.rejects(
      () => harness.service.reject('user-1', 'office', 'dp-1', 'gecerli bir sebep'),
      (error: unknown) => error instanceof ConflictException,
    );
  });
});

// ---------------------------------------------------------------------------
// Degismezlik
// ---------------------------------------------------------------------------

describe('AI ciktisi DEGISMEZ', () => {
  it('onay `AutomationProposal`i guncellemiyor', async () => {
    const harness = build();
    await harness.service.approve('user-1', 'office', 'dp-1', APPROVE);
    // Mock'ta `automationProposal` diye bir model YOK: servis ona dokunsaydi
    // bu test cagri hatasiyla duserdi.
    assert.equal(harness.proposals[0]!.proposalId, 'prop-1');
  });

  it('hazir olmayan oneri uygulanamaz', async () => {
    for (const generation of ['queued', 'processing', 'failed', 'expired']) {
      const harness = build({ generation });
      await assert.rejects(
        () => harness.service.approve('user-1', 'office', 'dp-1', APPROVE),
        (error: unknown) => error instanceof ConflictException,
        generation,
      );
    }
  });
});
