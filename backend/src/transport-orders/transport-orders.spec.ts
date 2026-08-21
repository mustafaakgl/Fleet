import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertAgentCannotApplyDirectly, revisionStatusFor } from './core/order-revision';
import { TransportOrdersService } from './transport-orders.service';

type Row = Record<string, unknown>;

/**
 * TICARI SIPARIS SERVISI (Faz 15).
 *
 * Prisma MOCK ama TEKILLIGI ve KOSULLU `updateMany`yi GERCEKTEN uyguluyor:
 * revizyon yarisi ve `expectedUpdatedAt` cakismasi ancak boyle anlamli.
 */

interface BuildOptions {
  status?: string;
  currentRevision?: number;
  assignments?: Row[];
  tours?: Row[];
  revisions?: Row[];
  contractedRevenue?: string | null;
  billingMode?: string;
  otherOrders?: Row[];
}

const BASE_UPDATED_AT = new Date('2026-08-19T09:00:00.000Z');

function build(options: BuildOptions = {}) {
  const orders: Row[] = [
    {
      id: 'order-1',
      tenantId: 'tenant-a',
      companyId: 'company-1',
      orderNumber: 'TO-2026-0001',
      externalReference: 'KD-4471',
      duplicateKey: 'company-1:KD-4471',
      orderDate: new Date('2026-08-20T00:00:00.000Z'),
      currency: 'EUR',
      contractedRevenue:
        options.contractedRevenue === undefined
          ? new Prisma.Decimal('2400.00')
          : options.contractedRevenue === null
            ? null
            : new Prisma.Decimal(options.contractedRevenue),
      billingMode: options.billingMode ?? 'on_order_completion',
      status: options.status ?? 'draft',
      source: 'manual',
      currentRevision: options.currentRevision ?? 1,
      notes: null,
      confirmedAt: null,
      confirmedById: null,
      cancelledAt: null,
      cancelledById: null,
      cancellationCategory: null,
      cancellationNote: null,
      createdById: 'user-office',
      createdAt: BASE_UPDATED_AT,
      updatedAt: BASE_UPDATED_AT,
    },
    ...(options.otherOrders ?? []),
  ];
  const consignments: Row[] = [
    {
      id: 'con-1',
      tenantId: 'tenant-a',
      transportOrderId: 'order-1',
      sequence: 1,
      pickupAddress: 'Duisburg',
      pickupWindowStart: null,
      pickupWindowEnd: null,
      deliveryAddress: 'Hamburg',
      deliveryWindowStart: null,
      deliveryWindowEnd: null,
      cargoDescription: 'Paletten',
      quantity: new Prisma.Decimal('12.000'),
      unit: 'pallet',
      weightKg: new Prisma.Decimal('8000.00'),
      volumeM3: null,
      palletCount: 12,
      adrStatus: 'unknown',
      temperatureMinC: null,
      temperatureMaxC: null,
      shipperReference: null,
      consigneeReference: null,
    },
  ];
  const assignments: Row[] = options.assignments ?? [];
  const tours: Row[] = options.tours ?? [];
  const revisions: Row[] = options.revisions ?? [
    {
      id: 'rev-1',
      transportOrderId: 'order-1',
      revisionNumber: 1,
      status: 'applied',
      snapshot: {},
      changedFields: [],
      source: 'manual',
      createdAt: BASE_UPDATED_AT,
      decidedAt: null,
      rejectionReason: null,
    },
  ];
  const audits: Row[] = [];
  // Fixture kimlikleriyle (`order-1`, `con-1`, `rev-1`) CAKISMASIN.
  let seq = 100;

  const matches = (row: Row, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    for (const [key, expected] of Object.entries(where)) {
      if (key === 'tenantId') continue;
      const actual = row[key];
      if (expected instanceof Date) {
        if (!(actual instanceof Date) || actual.getTime() !== expected.getTime()) return false;
        continue;
      }
      if (expected !== null && typeof expected === 'object') {
        const spec = expected as { in?: unknown[]; not?: unknown; gte?: Date; lte?: Date; some?: unknown };
        if (spec.in && !spec.in.includes(actual)) return false;
        if ('not' in spec && actual === spec.not) return false;
        continue;
      }
      if (actual !== expected) return false;
    }
    return true;
  };

  /**
   * `defaults`: gercek semadaki `@default` ve nullable alanlarin karsiligi.
   * Bunlar olmadan yeni satirlarda alanlar `undefined` kalir ve test, servisin
   * gercekte karsilasmayacagi bir durumda duser — sahte veritabani gercegi
   * taklit etmedigi icin.
   */
  const table = (
    store: Row[],
    prefix: string,
    uniques: string[][] = [],
    defaults: Row = {},
  ) => ({
    create: async (args: { data: Row; select?: unknown }) => {
      for (const keys of uniques) {
        if (
          store.some((row) =>
            keys.every((key) => row[key] !== null && row[key] === args.data[key]),
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
            meta: { target: keys.join('_') },
          });
        }
      }
      seq += 1;
      const row: Row = {
        id: `${prefix}-${seq}`,
        tenantId: 'tenant-a',
        createdAt: new Date(),
        ...defaults,
        ...args.data,
      };
      store.push(row);
      return { ...row };
    },
    createMany: async (args: { data: Row[] }) => {
      for (const item of args.data) {
        seq += 1;
        store.push({ id: `${prefix}-${seq}`, tenantId: 'tenant-a', ...defaults, ...item });
      }
      return { count: args.data.length };
    },
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const found = store.find((row) => matches(row, args.where));
      return found ? { ...found } : null;
    },
    findFirstOrThrow: async (args: { where?: Record<string, unknown> }) => {
      const found = store.find((row) => matches(row, args.where));
      if (!found) throw new Error('not found');
      return { ...found, consignments: consignments.filter((c) => c.transportOrderId === found.id) };
    },
    findMany: async (args: { where?: Record<string, unknown> } = {}) =>
      store.filter((row) => matches(row, args.where)).map((row) => ({ ...row })),
    count: async (args: { where?: Record<string, unknown> } = {}) =>
      store.filter((row) => matches(row, args.where)).length,
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of store) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data);
          // Gercek `@updatedAt` davranisi: her yazimda ilerler.
          if ('updatedAt' in row) row.updatedAt = new Date(Date.now() + seq);
          count += 1;
        }
      }
      return { count };
    },
    deleteMany: async (args: { where?: Record<string, unknown> }) => {
      let count = 0;
      for (let index = store.length - 1; index >= 0; index -= 1) {
        if (matches(store[index]!, args.where)) {
          store.splice(index, 1);
          count += 1;
        }
      }
      return { count };
    },
  });

  const withRelations = (order: Row) => ({
    ...order,
    consignments: consignments.filter((item) => item.transportOrderId === order.id),
    assignments: assignments.filter((item) => item.transportOrderId === order.id),
    company: { id: 'company-1', name: 'Musteri GmbH' },
    revisions: revisions
      .filter((item) => item.transportOrderId === order.id)
      .sort((a, b) => Number(b.revisionNumber) - Number(a.revisionNumber)),
  });

  const orderTable = table(orders, 'order', [['duplicateKey'], ['orderNumber']], {
    // Gercek semadaki `@updatedAt` ve nullable alanlar.
    updatedAt: new Date(),
    confirmedAt: null,
    confirmedById: null,
    cancelledAt: null,
    cancelledById: null,
    cancellationCategory: null,
    cancellationNote: null,
    notes: null,
    externalReference: null,
    duplicateKey: null,
    contractedRevenue: null,
  });
  const client = {
    transportOrder: {
      ...orderTable,
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const found = orders.find((row) => matches(row, args.where));
        return found ? withRelations(found) : null;
      },
      findMany: async (args: { where?: Record<string, unknown> } = {}) =>
        orders.filter((row) => matches(row, args.where)).map(withRelations),
    },
    consignment: table(consignments, 'con'),
    transportOrderRevision: table(
      revisions,
      'rev',
      [['transportOrderId', 'revisionNumber']],
      { decidedAt: null, decidedById: null, rejectionReason: null, changedFields: [] },
    ),
    company: {
      findFirst: async (args: { where?: Record<string, unknown> }) =>
        (args.where ?? {}).id === 'company-1' ? { id: 'company-1' } : null,
    },
    tour: {
      findMany: async () => tours.map((row) => ({ ...row })),
    },
  };

  const prisma = {
    ...client,
    unscoped: client,
    $transaction: async <T>(fn: (tx: typeof client) => Promise<T>): Promise<T> => {
      const snapshots = [consignments, revisions].map((store) => [store, [...store]] as const);
      try {
        return await fn(client);
      } catch (error) {
        // ROLLBACK taklidi.
        for (const [store, copy] of snapshots) {
          store.length = 0;
          store.push(...copy);
        }
        throw error;
      }
    },
  };

  const audit = {
    logAction: async (entry: Row) => {
      audits.push(entry);
      return {};
    },
  };

  /**
   * Faz 17g: kalem adresleri artik `Location` kaydina baglaniyor.
   *
   * Taklit GEOCODE ETMIYOR, deterministik bir kimlik doner: testin olctugu
   * sey konum cozumu degil, siparis mantigi. Gercek geocoder'a gitmek testi
   * bir ag servisine bagimli kilardi.
   */
  const routing = {
    async resolveLocation({ rawAddress }: { rawAddress: string }) {
      return { id: `loc-${rawAddress.slice(0, 12).replace(/\s+/g, '-')}` };
    },
  };

  const service = new TransportOrdersService(prisma as never, audit as never, routing as never);
  return { service, orders, consignments, assignments, tours, revisions, audits };
}

const expectedOf = (ctx: ReturnType<typeof build>) =>
  (ctx.orders[0]!.updatedAt as Date).toISOString();

// ---------------------------------------------------------------------------

describe('Siparis olusturma', () => {
  it('AYNI musteri + AYNI referans duplicate uyarisi verir', async () => {
    const ctx = build();
    await assert.rejects(
      ctx.service.createDraft('user-office', {
        companyId: 'company-1',
        orderNumber: 'TO-2026-0002',
        externalReference: 'KD-4471',
        orderDate: '2026-08-21',
        currency: 'EUR',
      }),
      (error: unknown) =>
        error instanceof ConflictException &&
        (error.getResponse() as Row).code === 'transport_order_duplicate_reference',
    );
    assert.equal(ctx.orders.length, 1, 'duplicate siparis olusmus');
  });

  it('kullanici ACIKCA onaylarsa duplicate gecilebilir', async () => {
    const ctx = build();
    await ctx.service.createDraft('user-office', {
      companyId: 'company-1',
      orderNumber: 'TO-2026-0002',
      externalReference: 'KD-9999',
      orderDate: '2026-08-21',
      currency: 'EUR',
      acknowledgeDuplicateReference: true,
    });
    assert.equal(ctx.orders.length, 2);
  });

  it('para birimi EUR VARSAYILMAZ', async () => {
    const ctx = build();
    await assert.rejects(
      ctx.service.createDraft('user-office', {
        companyId: 'company-1',
        orderNumber: 'TO-X',
        orderDate: '2026-08-21',
        currency: '',
      }),
      BadRequestException,
    );
  });

  it('baska kiracinin musterisine siparis acilamaz', async () => {
    const ctx = build();
    await assert.rejects(
      ctx.service.createDraft('user-office', {
        companyId: 'company-foreign',
        orderNumber: 'TO-X',
        orderDate: '2026-08-21',
        currency: 'EUR',
      }),
      BadRequestException,
    );
  });

  it('olusturma ILK revizyonu birakir', async () => {
    const ctx = build();
    await ctx.service.createDraft('user-office', {
      companyId: 'company-1',
      orderNumber: 'TO-2026-0003',
      orderDate: '2026-08-21',
      currency: 'EUR',
      consignments: [
        { pickupAddress: 'Koln', deliveryAddress: 'Berlin', cargoDescription: 'Stahl' },
      ],
    });
    const created = ctx.revisions.filter((item) => item.transportOrderId !== 'order-1');
    assert.equal(created.length, 1);
    assert.equal(created[0]!.revisionNumber, 1);
    assert.equal(created[0]!.status, 'applied');
  });

  it('ADR belirtilmezse `unknown` — `no` VARSAYILMAZ', async () => {
    const ctx = build();
    await ctx.service.createDraft('user-office', {
      companyId: 'company-1',
      orderNumber: 'TO-2026-0004',
      orderDate: '2026-08-21',
      currency: 'EUR',
      consignments: [
        { pickupAddress: 'Koln', deliveryAddress: 'Berlin', cargoDescription: 'Stahl' },
      ],
    });
    const added = ctx.consignments.find((item) => item.transportOrderId !== 'order-1');
    assert.equal(added!.adrStatus, 'unknown');
  });

  it('sozlesme tutari DENETIME girmez', async () => {
    const ctx = build();
    await ctx.service.createDraft('user-office', {
      companyId: 'company-1',
      orderNumber: 'TO-2026-0005',
      orderDate: '2026-08-21',
      currency: 'EUR',
      contractedRevenue: 7350.5,
    });
    const entry = ctx.audits.find((row) => row.action === 'transport_order.created');
    assert.ok(!JSON.stringify(entry!.metadata).includes('7350.5'), 'tutar denetime sizdi');
  });
});

describe('Draft / confirmed yasam dongusu', () => {
  it('draft onaylanir', async () => {
    const ctx = build();
    const result = await ctx.service.confirm('user-boss', 'order-1', expectedOf(ctx));
    assert.equal(result.status, 'confirmed');
    assert.equal(ctx.orders[0]!.confirmedById, 'user-boss');
  });

  it('tekrarlanan onay CAKISMA degil', async () => {
    const ctx = build();
    await ctx.service.confirm('user-boss', 'order-1', expectedOf(ctx));
    const again = await ctx.service.confirm('user-boss', 'order-1', expectedOf(ctx));
    assert.equal(again.status, 'confirmed');
  });

  it('BAYAT `expectedUpdatedAt` reddedilir', async () => {
    const ctx = build();
    await assert.rejects(
      ctx.service.confirm('user-boss', 'order-1', '2020-01-01T00:00:00.000Z'),
      ConflictException,
    );
    assert.equal(ctx.orders[0]!.status, 'draft');
  });
});

describe('Revizyon — APPEND-ONLY', () => {
  it('draft degisikligi DOGRUDAN uygulanir', async () => {
    const ctx = build();
    await ctx.service.amend('user-office', 'order-1', expectedOf(ctx), {
      contractedRevenue: 2900,
    });
    assert.equal(ctx.orders[0]!.currentRevision, 2);
    const rev2 = ctx.revisions.find((item) => item.revisionNumber === 2);
    assert.equal(rev2!.status, 'applied');
    assert.equal(String(ctx.orders[0]!.contractedRevenue), '2900');
  });

  it('ONAYLANMIS sipariste degisiklik ANA KAYDI DEGISTIRMEZ', async () => {
    const ctx = build({ status: 'confirmed' });
    const before = String(ctx.orders[0]!.contractedRevenue);

    await ctx.service.amend('user-office', 'order-1', expectedOf(ctx), {
      contractedRevenue: 2900,
    });

    const rev2 = ctx.revisions.find((item) => item.revisionNumber === 2);
    assert.equal(rev2!.status, 'pending_review');
    // ANA KAYIT DEGISMEDI.
    assert.equal(String(ctx.orders[0]!.contractedRevenue), before);
    assert.equal(ctx.orders[0]!.currentRevision, 1);
  });

  it('revizyon ESKI ve YENI degerleri tasir', async () => {
    const ctx = build({ status: 'confirmed' });
    await ctx.service.amend('user-office', 'order-1', expectedOf(ctx), {
      contractedRevenue: 2900,
    });
    const rev2 = ctx.revisions.find((item) => item.revisionNumber === 2);
    const changes = rev2!.changedFields as Array<Row>;
    assert.deepEqual(changes, [
      { field: 'contractedRevenue', before: '2400.00', after: '2900.00' },
    ]);
  });

  it('ESKI revizyon YENIDEN YAZILMAZ', async () => {
    const ctx = build();
    const original = { ...ctx.revisions[0]! };
    await ctx.service.amend('user-office', 'order-1', expectedOf(ctx), { notes: 'yeni not' });

    const rev1 = ctx.revisions.find((item) => item.revisionNumber === 1);
    assert.deepEqual(rev1, original, 'birinci revizyon degismis');
  });

  it('DEGISIKLIK YOKSA revizyon yazilmaz', async () => {
    const ctx = build();
    await assert.rejects(
      ctx.service.amend('user-office', 'order-1', expectedOf(ctx), { currency: 'EUR' }),
      BadRequestException,
    );
    assert.equal(ctx.revisions.length, 1);
  });

  it('iptal edilmis siparis degistirilemez', async () => {
    const ctx = build({ status: 'cancelled' });
    await assert.rejects(
      ctx.service.amend('user-office', 'order-1', expectedOf(ctx), { notes: 'x' }),
      ConflictException,
    );
  });

  it('AJAN kaynagi TASLAKTA da dogrudan UYGULAYAMAZ — insan onayina duser', async () => {
    // Siparis TASLAK: manuel bir degisiklik burada dogrudan `applied` olurdu.
    // Ajan kaynagi olunca OLMUYOR.
    const ctx = build();
    await ctx.service.amend(
      'user-office',
      'order-1',
      expectedOf(ctx),
      { notes: 'ajandan' },
      'email_agent' as never,
    );

    const revision = ctx.revisions[ctx.revisions.length - 1]!;
    assert.equal(revision.status, 'pending_review');
    assert.equal(revision.source, 'email_agent');
    // ANA KAYIT DEGISMEDI: bekleyen revizyon onaylanana kadar notlar eski.
    assert.notEqual(ctx.orders[0]!.notes, 'ajandan');
  });

  it('ajan kaynakli `applied` bir revizyon KURULAMAZ — kapi hala yerinde', () => {
    // Yukaridaki davranis degisikligi kapiyi GEVSETMIYOR: birisi durumu elle
    // `applied` yapmaya kalkarsa bu hala bir hata.
    assert.throws(
      () => assertAgentCannotApplyDirectly('email_agent', 'applied'),
      /non_manual_revision_must_be_pending_review/,
    );
    assert.equal(revisionStatusFor('draft', 'email_agent'), 'pending_review');
    assert.equal(revisionStatusFor('draft', 'manual'), 'applied');
  });
});

describe('Amendment onay / red', () => {
  async function pending() {
    const ctx = build({ status: 'confirmed' });
    await ctx.service.amend('user-office', 'order-1', expectedOf(ctx), {
      contractedRevenue: 2900,
    });
    const revision = ctx.revisions.find((item) => item.revisionNumber === 2)!;
    return { ctx, revisionId: revision.id as string };
  }

  it('onay ana kaydi GUNCELLER', async () => {
    const { ctx, revisionId } = await pending();
    await ctx.service.approveAmendment('user-boss', 'order-1', revisionId, expectedOf(ctx));
    assert.equal(String(ctx.orders[0]!.contractedRevenue), '2900');
    assert.equal(ctx.orders[0]!.currentRevision, 2);
  });

  it('EZAMANLI iki onayda YALNIZ BIRI kazanir', async () => {
    const { ctx, revisionId } = await pending();
    const expected = expectedOf(ctx);

    const results = await Promise.allSettled([
      ctx.service.approveAmendment('user-a', 'order-1', revisionId, expected),
      ctx.service.approveAmendment('user-b', 'order-1', revisionId, expected),
    ]);

    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    assert.equal(fulfilled.length, 1, 'iki onay birden gecti');
    assert.equal(ctx.orders[0]!.currentRevision, 2);
  });

  it('RED ana kaydi DEGISTIRMEZ', async () => {
    const { ctx, revisionId } = await pending();
    const before = String(ctx.orders[0]!.contractedRevenue);

    await ctx.service.rejectAmendment('user-boss', 'order-1', revisionId, 'Musteri vazgecti.');

    assert.equal(String(ctx.orders[0]!.contractedRevenue), before);
    assert.equal(ctx.orders[0]!.currentRevision, 1);
    const revision = ctx.revisions.find((item) => item.id === revisionId);
    assert.equal(revision!.status, 'rejected');
  });

  it('red sebebi ZORUNLU', async () => {
    const { ctx, revisionId } = await pending();
    await assert.rejects(
      ctx.service.rejectAmendment('user-boss', 'order-1', revisionId, 'x'),
      BadRequestException,
    );
  });

  it('reddedilmis revizyon TEKRAR onaylanamaz', async () => {
    const { ctx, revisionId } = await pending();
    await ctx.service.rejectAmendment('user-boss', 'order-1', revisionId, 'Musteri vazgecti.');
    await assert.rejects(
      ctx.service.approveAmendment('user-boss', 'order-1', revisionId, expectedOf(ctx)),
      ConflictException,
    );
  });
});

describe('Iptal', () => {
  it('PLANLANMAMIS siparis onay istemeden iptal edilir', async () => {
    const ctx = build({ status: 'confirmed' });
    const result = await ctx.service.cancel('user-boss', 'order-1', {
      expectedUpdatedAt: expectedOf(ctx),
      category: 'customer_cancelled',
    });
    assert.equal(result.status, 'cancelled');
  });

  it('AKTIF TURLU siparis ACIK ONAY ister ve etkiyi GOSTERIR', async () => {
    const ctx = build({
      status: 'confirmed',
      assignments: [{ id: 'asg-1', transportOrderId: 'order-1', status: 'planned', consignmentId: 'con-1', sourceRevision: 1, expectedDailyRevenue: null, workDate: new Date(), driverId: 'd1', vehicleId: 'v1' }],
      tours: [{ id: 'tour-1', status: 'released' }],
    });

    await assert.rejects(
      ctx.service.cancel('user-boss', 'order-1', {
        expectedUpdatedAt: expectedOf(ctx),
        category: 'customer_cancelled',
      }),
      (error: unknown) => {
        const body = (error as ConflictException).getResponse() as Row;
        assert.equal(body.code, 'transport_order_cancellation_needs_acknowledgement');
        const impact = body.impact as Row;
        assert.equal(impact.releasedTourCount, 1);
        assert.deepEqual(impact.assignmentIds, ['asg-1']);
        return true;
      },
    );
    assert.equal(ctx.orders[0]!.status, 'confirmed', 'onaysiz iptal gecti');
  });

  it('IPTAL Assignment ve Tour kayitlarini SILMEZ', async () => {
    const ctx = build({
      status: 'confirmed',
      assignments: [{ id: 'asg-1', transportOrderId: 'order-1', status: 'planned', consignmentId: 'con-1', sourceRevision: 1, expectedDailyRevenue: null, workDate: new Date(), driverId: 'd1', vehicleId: 'v1' }],
      tours: [{ id: 'tour-1', status: 'released' }],
    });

    await ctx.service.cancel('user-boss', 'order-1', {
      expectedUpdatedAt: expectedOf(ctx),
      category: 'customer_cancelled',
      acknowledgeImpact: true,
    });

    assert.equal(ctx.orders[0]!.status, 'cancelled');
    // Operasyon kayitlari YERINDE.
    assert.equal(ctx.assignments.length, 1);
    assert.equal(ctx.tours.length, 1);
    assert.equal(ctx.assignments[0]!.status, 'planned', 'gorev sessizce degistirilmis');
  });

  it('TAMAMLANMIS siparis geriye donuk IPTAL EDILEMEZ', async () => {
    const ctx = build({
      status: 'confirmed',
      assignments: [{ id: 'asg-1', transportOrderId: 'order-1', status: 'completed', consignmentId: 'con-1', sourceRevision: 1, expectedDailyRevenue: null, workDate: new Date(), driverId: 'd1', vehicleId: 'v1' }],
    });
    await assert.rejects(
      ctx.service.cancel('user-boss', 'order-1', {
        expectedUpdatedAt: expectedOf(ctx),
        category: 'created_in_error',
        acknowledgeImpact: true,
      }),
      (error: unknown) =>
        (error as ConflictException).getResponse() &&
        ((error as ConflictException).getResponse() as Row).code ===
          'order_completed_cannot_cancel',
    );
  });

  it('`other` sebebi ACIKLAMA ister', async () => {
    const ctx = build({ status: 'confirmed' });
    await assert.rejects(
      ctx.service.cancel('user-boss', 'order-1', {
        expectedUpdatedAt: expectedOf(ctx),
        category: 'other',
      }),
      BadRequestException,
    );
  });

  it('iptal referansi SERBEST BIRAKIR', async () => {
    const ctx = build({ status: 'confirmed' });
    await ctx.service.cancel('user-boss', 'order-1', {
      expectedUpdatedAt: expectedOf(ctx),
      category: 'duplicate_order',
    });
    assert.equal(ctx.orders[0]!.duplicateKey, null);
  });

  it('etkilenen kayitlar DENETIME yazilir', async () => {
    const ctx = build({
      status: 'confirmed',
      assignments: [{ id: 'asg-1', transportOrderId: 'order-1', status: 'in_progress', consignmentId: 'con-1', sourceRevision: 1, expectedDailyRevenue: null, workDate: new Date(), driverId: 'd1', vehicleId: 'v1' }],
    });
    await ctx.service.cancel('user-boss', 'order-1', {
      expectedUpdatedAt: expectedOf(ctx),
      category: 'customer_cancelled',
      acknowledgeImpact: true,
    });
    const entry = ctx.audits.find((row) => row.action === 'transport_order.cancelled');
    const metadata = entry!.metadata as Row;
    assert.equal(metadata.activeAssignmentCount, 1);
    assert.equal(metadata.acknowledged, true);
  });
});

describe('Detay — turetilmis alanlar', () => {
  function withAssignments(assignments: Row[], overrides: BuildOptions = {}) {
    return build({
      status: 'confirmed',
      assignments: assignments.map((item) => ({
        transportOrderId: 'order-1',
        consignmentId: 'con-1',
        sourceRevision: 1,
        expectedDailyRevenue: null,
        workDate: new Date(),
        driverId: 'd1',
        vehicleId: 'v1',
        ...item,
      })),
      ...overrides,
    });
  }

  it('BIR SIPARIS COK ASSIGNMENT tasiyabilir', async () => {
    const ctx = withAssignments([
      { id: 'asg-1', status: 'planned' },
      { id: 'asg-2', status: 'planned' },
    ]);
    const detail = await ctx.service.detail('order-1');
    assert.equal((detail.assignments as Row[]).length, 2);
  });

  it('POD YOKKEN faturaya hazir GORUNMEZ', async () => {
    const ctx = withAssignments([{ id: 'asg-1', status: 'completed' }]);
    const detail = await ctx.service.detail('order-1');
    const billing = detail.billing as Row;
    assert.equal(billing.readiness, 'unknown');
    assert.notEqual(billing.readiness, 'verified');
    assert.equal(billing.deliveryVerificationAvailable, false);
  });

  it('ESKI revizyondan uretilmis gorev ISARETLENIR', async () => {
    const ctx = withAssignments([{ id: 'asg-1', status: 'planned', sourceRevision: 1 }], {
      currentRevision: 3,
    });
    const detail = await ctx.service.detail('order-1');
    assert.equal((detail.assignments as Row[])[0]!.staleAgainstOrder, true);
  });

  it('GELIR TAHSISI izlenebilir', async () => {
    const ctx = withAssignments([
      { id: 'asg-1', status: 'planned', expectedDailyRevenue: new Prisma.Decimal('900.00') },
      { id: 'asg-2', status: 'planned', expectedDailyRevenue: new Prisma.Decimal('600.00') },
    ]);
    const detail = await ctx.service.detail('order-1');
    const allocation = detail.revenueAllocation as Row;
    assert.equal(allocation.allocated, 1500);
    assert.equal(allocation.remaining, 900);
    assert.equal(allocation.overAllocated, false);
  });

  it('Decimal alanlar API\'de STRING doner', async () => {
    const ctx = withAssignments([]);
    const detail = await ctx.service.detail('order-1');
    assert.equal(typeof detail.contractedRevenue, 'string');
    assert.equal(detail.contractedRevenue, '2400.00');
  });

  it('fulfillment ticari durumdan AYRI', async () => {
    const ctx = withAssignments([]);
    const detail = await ctx.service.detail('order-1');
    assert.equal(detail.status, 'confirmed');
    assert.equal(detail.fulfillment, 'unplanned');
  });
});
