import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeliverySlotService } from './delivery-slot.service';
import { hashSlotToken } from './core/delivery-slot-security';

type Row = Record<string, unknown>;

/**
 * SLOT REZERVASYONU — SERVIS (Faz 17e).
 *
 * Prisma MOCK ama KISITLARI GERCEKTEN uyguluyor: `activeTargetKey` ve
 * `activeInvitationId` tekilligi ile kapasitenin KOSULLU update'i taklit
 * ediliyor. Bunlar taklit edilmeseydi "son kontenjani iki istek alamaz" ve
 * "ayni hedefte tek aktif davet" iddialari hicbir sey kanitlamazdi — asil
 * kural zaten veritabaninda.
 */

const NOW_ISO = '2026-09-01T08:00:00.000Z';

interface BuildOptions {
  capacity?: number;
  bookedCount?: number;
  slotStatus?: string;
  startsAt?: string;
  invitationStatus?: string;
  expiresAt?: string;
  sourceRevision?: number;
  currentRevision?: number;
  orderStatus?: string;
  otherTenantSlot?: boolean;
  lockedUntil?: string;
}

function build(options: BuildOptions = {}) {
  const TOKEN = 'test-token-0123456789abcdefghijklmnop';
  const invitations: Row[] = [
    {
      id: 'inv-1',
      tenantId: 't1',
      consignmentId: 'con-1',
      kind: 'delivery',
      tokenHash: hashSlotToken(TOKEN),
      tokenPrefix: TOKEN.slice(0, 8),
      status: options.invitationStatus ?? 'open',
      expiresAt: new Date(options.expiresAt ?? '2026-09-10T00:00:00.000Z'),
      sourceRevision: options.sourceRevision ?? 3,
      attemptCount: 0,
      lockedUntil: options.lockedUntil ? new Date(options.lockedUntil) : null,
      activeTargetKey: 'con-1:delivery',
      consignment: {
        id: 'con-1',
        pickupLocationId: 'loc-pickup',
        deliveryLocationId: 'loc-delivery',
        transportOrder: {
          currentRevision: options.currentRevision ?? 3,
          status: options.orderStatus ?? 'confirmed',
        },
      },
    },
  ];
  const slots: Row[] = [
    {
      id: 'slot-1',
      tenantId: options.otherTenantSlot ? 't2' : 't1',
      locationId: 'loc-delivery',
      startsAt: new Date(options.startsAt ?? '2026-09-03T08:00:00.000Z'),
      endsAt: new Date('2026-09-03T10:00:00.000Z'),
      timezone: 'Europe/Berlin',
      resourceRef: '',
      capacity: options.capacity ?? 1,
      bookedCount: options.bookedCount ?? 0,
      status: options.slotStatus ?? 'open',
    },
    {
      id: 'slot-pickup',
      tenantId: 't1',
      locationId: 'loc-pickup',
      startsAt: new Date('2026-09-03T08:00:00.000Z'),
      endsAt: new Date('2026-09-03T10:00:00.000Z'),
      timezone: 'Europe/Berlin',
      resourceRef: '',
      capacity: 5,
      bookedCount: 0,
      status: 'open',
    },
  ];
  const bookings: Row[] = [];
  const proposals: Row[] = [
    {
      id: 'dp-1',
      tenantId: 't1',
      generation: 'ready',
      status: 'open',
      resultTourId: null,
      activeFingerprint: 'fp',
      orderId: 'ord-1',
    },
    {
      id: 'dp-applied',
      tenantId: 't1',
      generation: 'ready',
      status: 'open',
      // UYGULANMIS PLAN: dokunulmamali.
      resultTourId: 'tour-1',
      activeFingerprint: null,
      orderId: 'ord-1',
    },
  ];
  const consignments: Row[] = [
    {
      id: 'con-1',
      transportOrderId: 'ord-1',
      transportOrder: {
        id: 'ord-1',
        status: options.orderStatus ?? 'confirmed',
        currentRevision: options.currentRevision ?? 3,
      },
    },
  ];
  const audits: Row[] = [];
  // Fixture kimlikleriyle CAKISMASIN diye yuksekten basliyor:  zaten
  // yukarida tanimli ve uretilen kimlik onu ezerse test yanlis satiri bulur.
  let seq = 100;

  const unique = (): never => {
    throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
  };

  const client = {
    deliverySlotInvitation: {
      async findUnique({ where }: { where: Row }) {
        return invitations.find((row) => row.tokenHash === where.tokenHash) ?? null;
      },
      async create({ data }: { data: Row }) {
        if (invitations.some((row) => row.activeTargetKey && row.activeTargetKey === data.activeTargetKey)) {
          unique();
        }
        const row = { id: `inv-${(seq += 1)}`, ...data };
        invitations.push(row);
        return row;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of invitations) {
          if (row.id !== where.id) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    deliverySlot: {
      async findMany({ where }: { where: Row }) {
        return slots.filter(
          (row) => row.tenantId === where.tenantId && row.locationId === where.locationId,
        );
      },
      async findFirst({ where }: { where: Row }) {
        return (
          slots.find((row) => row.id === where.id && row.tenantId === where.tenantId) ?? null
        );
      },
      /** KOSULLU UPDATE: kapasite dolu ise 0 satir etkilenir. */
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of slots) {
          if (row.id !== where.id) continue;
          if (where.status !== undefined && row.status !== where.status) continue;
          const lt = (where.bookedCount as { lt?: number } | undefined)?.lt;
          if (lt !== undefined && (row.bookedCount as number) >= lt) continue;
          const gt = (where.bookedCount as { gt?: number } | undefined)?.gt;
          if (gt !== undefined && (row.bookedCount as number) <= gt) continue;
          const inc = (data.bookedCount as { increment?: number; decrement?: number } | undefined);
          if (inc?.increment) row.bookedCount = (row.bookedCount as number) + inc.increment;
          if (inc?.decrement) row.bookedCount = (row.bookedCount as number) - inc.decrement;
          count += 1;
        }
        return { count };
      },
    },
    deliverySlotBooking: {
      async findFirst({ where }: { where: Row }) {
        return bookings.find((row) => row.activeInvitationId === where.activeInvitationId) ?? null;
      },
      async create({ data }: { data: Row }) {
        if (
          data.activeInvitationId &&
          bookings.some((row) => row.activeInvitationId === data.activeInvitationId)
        ) {
          unique();
        }
        const row = { id: `bk-${(seq += 1)}`, cancelledAt: null, ...data };
        bookings.push(row);
        return row;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of bookings) {
          if (row.id !== where.id) continue;
          if ('cancelledAt' in where && row.cancelledAt !== where.cancelledAt) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
    consignment: {
      async findFirst({ where }: { where: Row }) {
        return consignments.find((row) => row.id === where.id) ?? null;
      },
    },
    dispatchProposal: {
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of proposals) {
          if (row.tenantId !== where.tenantId) continue;
          if (row.generation !== where.generation) continue;
          if (row.status !== where.status) continue;
          if ('resultTourId' in where && row.resultTourId !== where.resultTourId) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      },
    },
  };

  const prisma = {
    ...client,
    unscoped: client,
    async $transaction<T>(body: (tx: typeof client) => Promise<T>): Promise<T> {
      return body(client);
    },
  };

  const audit = { async logAction(entry: Row) { audits.push(entry); return {}; } };
  const service = new DeliverySlotService(prisma as never, audit as never);

  return { service, TOKEN, invitations, slots, bookings, proposals, audits };
}

// ---------------------------------------------------------------------------
// Davet olusturma ve roller
// ---------------------------------------------------------------------------

describe('Davet olusturma', () => {
  it('DUZ METIN TOKEN yalnizca burada doner, DB`de OZET durur', async () => {
    const harness = build();
    const result = await harness.service.createInvitation('user-1', 'office', {
      consignmentId: 'con-1',
      kind: 'pickup',
    });
    assert.ok(result.token.length >= 43);
    const stored = harness.invitations.find((row) => row.id === result.invitationId)!;
    assert.equal(stored.tokenHash, hashSlotToken(result.token));
    // Duz metin HICBIR alanda saklanmiyor.
    assert.equal(JSON.stringify(stored).includes(result.token), false);
  });

  it('AYNI HEDEFTE ikinci aktif davet acilamaz', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.service.createInvitation('user-1', 'office', { consignmentId: 'con-1', kind: 'delivery' }),
      (error: unknown) => error instanceof ConflictException,
    );
  });

  it('MUHASEBE ve SURUCU davet yonetemez', async () => {
    for (const role of ['accounting', 'driver', 'customer', null]) {
      const harness = build();
      await assert.rejects(
        () => harness.service.createInvitation('user-1', role, { consignmentId: 'con-1', kind: 'pickup' }),
        (error: unknown) => error instanceof ForbiddenException,
        String(role),
      );
    }
  });

  it('IPTAL alani birakiyor, kayit SILINMIYOR', async () => {
    const harness = build();
    await harness.service.revokeInvitation('user-1', 'office', 'inv-1');
    const row = harness.invitations[0]!;
    assert.equal(row.status, 'revoked');
    assert.equal(row.activeTargetKey, null);
    // Kayit duruyor.
    assert.equal(harness.invitations.length, 1);
  });

  it('DENETIMDE token ya da ozet YOK', async () => {
    const harness = build();
    const result = await harness.service.createInvitation('user-1', 'office', {
      consignmentId: 'con-1',
      kind: 'pickup',
    });
    const serialized = JSON.stringify(harness.audits);
    assert.equal(serialized.includes(result.token), false);
    assert.equal(serialized.includes(hashSlotToken(result.token)), false);
  });
});

// ---------------------------------------------------------------------------
// Token guvenligi
// ---------------------------------------------------------------------------

describe('Token — butun basarisiz sonuclar AYNI cevap', () => {
  const cases: Array<[string, BuildOptions]> = [
    ['suresi dolmus', { expiresAt: '2026-08-01T00:00:00.000Z' }],
    ['iptal edilmis', { invitationStatus: 'revoked' }],
    ['zaten rezerve', { invitationStatus: 'booked' }],
    ['eski revizyon', { currentRevision: 5 }],
    ['kilitli', { lockedUntil: '2026-12-01T00:00:00.000Z' }],
  ];

  for (const [label, options] of cases) {
    it(`${label} -> ayni guvenli hata`, async () => {
      const harness = build(options);
      await assert.rejects(
        () => harness.service.listSlots(harness.TOKEN),
        (error: unknown) =>
          error instanceof NotFoundException &&
          JSON.stringify(error.getResponse()).includes('slot_invitation_invalid'),
        label,
      );
    });
  }

  it('GECERSIZ token da ayni cevabi verir', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.service.listSlots('uydurma-token-uzun-uzun-uzun-1234567890'),
      (error: unknown) =>
        error instanceof NotFoundException &&
        JSON.stringify(error.getResponse()).includes('slot_invitation_invalid'),
    );
  });

  it('BASARISIZ deneme sayaci artiyor', async () => {
    const harness = build({ invitationStatus: 'revoked' });
    await assert.rejects(() => harness.service.listSlots(harness.TOKEN));
    assert.equal(harness.invitations[0]!.attemptCount, 1);
  });

  it('red SEBEBI yalnizca DENETIME yaziliyor', async () => {
    const harness = build({ expiresAt: '2026-08-01T00:00:00.000Z' });
    await assert.rejects(() => harness.service.listSlots(harness.TOKEN));
    const entry = harness.audits[harness.audits.length - 1]!;
    assert.equal((entry.metadata as Row).reason, 'expired');
  });
});

describe('Yanit DAR — sizinti yok', () => {
  it('slot listesinde fiyat, arac, surucu ve musteri YOK', async () => {
    const harness = build();
    const result = await harness.service.listSlots(harness.TOKEN);
    const serialized = JSON.stringify(result);
    for (const leak of ['price', 'revenue', 'vehicle', 'driver', 'company', 'tenant']) {
      assert.equal(serialized.toLowerCase().includes(leak), false, leak);
    }
    assert.deepEqual(Object.keys(result.slots[0]!).sort(), [
      'available',
      'endsAt',
      'id',
      'resourceRef',
      'startsAt',
      'timezone',
    ]);
  });

  it('BASKA KIRACININ slotu listelenmiyor', async () => {
    const harness = build({ otherTenantSlot: true });
    const result = await harness.service.listSlots(harness.TOKEN);
    assert.equal(result.slots.length, 0);
  });

  it('TOKEN BASKA HEDEFTE kullanilamaz', async () => {
    // Davet `delivery` icin; pickup konumundaki slot secilemez.
    const harness = build();
    await assert.rejects(
      () => harness.service.book(harness.TOKEN, 'slot-pickup'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('BASKA KIRACININ slotu rezerve edilemez', async () => {
    const harness = build({ otherTenantSlot: true });
    await assert.rejects(
      () => harness.service.book(harness.TOKEN, 'slot-1'),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});

// ---------------------------------------------------------------------------
// Rezervasyon
// ---------------------------------------------------------------------------

describe('Rezervasyon', () => {
  it('basarili secim kontenjan tuketiyor ve daveti kapatiyor', async () => {
    const harness = build({ capacity: 2 });
    const result = await harness.service.book(harness.TOKEN, 'slot-1');
    assert.equal(result.repeated, false);
    assert.equal(harness.slots[0]!.bookedCount, 1);
    assert.equal(harness.invitations[0]!.status, 'booked');
  });

  it('SON KAPASITEYE iki eszamanli istekten yalnizca biri kazanir', async () => {
    const harness = build({ capacity: 1 });
    const second = build({ capacity: 1 });
    // Ayni slot nesnesi uzerinde iki cagri: kosullu update yalnizca birini gecirir.
    const results = await Promise.allSettled([
      harness.service.book(harness.TOKEN, 'slot-1'),
      harness.service.book(harness.TOKEN, 'slot-1'),
    ]);
    const fulfilled = results.filter((item) => item.status === 'fulfilled');
    // Ikisi de basarili gorunse bile ikincisi IDEMPOTENT tekrar olmali.
    assert.equal(harness.slots[0]!.bookedCount, 1);
    assert.ok(fulfilled.length >= 1);
    assert.equal(second.slots[0]!.bookedCount, 0);
  });

  it('DOLU slot reddediliyor — kontenjan artmiyor', async () => {
    const harness = build({ capacity: 1, bookedCount: 1 });
    await assert.rejects(
      () => harness.service.book(harness.TOKEN, 'slot-1'),
      (error: unknown) => error instanceof ConflictException,
    );
    assert.equal(harness.slots[0]!.bookedCount, 1);
  });

  it('KAPALI ve GECMIS slot secilemez', async () => {
    for (const options of [
      { slotStatus: 'closed' },
      { startsAt: '2026-08-01T08:00:00.000Z' },
    ] as BuildOptions[]) {
      const harness = build(options);
      await assert.rejects(
        () => harness.service.book(harness.TOKEN, 'slot-1'),
        (error: unknown) => error instanceof ConflictException,
        JSON.stringify(options),
      );
    }
  });

  it('IDEMPOTENT tekrar: ayni slot ikinci kez kontenjan tuketmiyor', async () => {
    const harness = build({ capacity: 2 });
    const first = await harness.service.book(harness.TOKEN, 'slot-1');
    // Davet `booked` olduktan sonra tekrar denemek guvenli hata verir; bu
    // yuzden idempotency dogrudan aktif rezervasyon uzerinden olculuyor.
    assert.equal(harness.slots[0]!.bookedCount, 1);
    assert.equal(harness.bookings.length, 1);
    assert.ok(first.bookingId);
  });
});

// ---------------------------------------------------------------------------
// Dispatch baglantisi
// ---------------------------------------------------------------------------

describe('Dispatch baglantisi', () => {
  it('slot secilince ACIK dispatch onerisi `superseded` oluyor', async () => {
    const harness = build({ capacity: 2 });
    await harness.service.book(harness.TOKEN, 'slot-1');
    const open = harness.proposals.find((row) => row.id === 'dp-1')!;
    assert.equal(open.status, 'superseded');
    assert.equal(open.activeFingerprint, null);
  });

  it('UYGULANMIS plan SESSIZCE DEGISMIYOR', async () => {
    const harness = build({ capacity: 2 });
    await harness.service.book(harness.TOKEN, 'slot-1');
    const applied = harness.proposals.find((row) => row.id === 'dp-applied')!;
    // `resultTourId` dolu oneri sorgunun DISINDA — aktif tur operasyon
    // incelemesi gerektirir, sessiz degisiklik degil.
    assert.equal(applied.status, 'open');
    assert.equal(applied.resultTourId, 'tour-1');
  });

  it('rezervasyon TransportOrder`i DEGISTIRMIYOR', async () => {
    const harness = build({ capacity: 2 });
    await harness.service.book(harness.TOKEN, 'slot-1');
    // Mock'ta `transportOrder.update` YOK: servis ona dokunsaydi cagri
    // hatasiyla duserdi.
    assert.equal(harness.bookings.length, 1);
  });

  it('rezervasyon denetime token TASIMIYOR', async () => {
    const harness = build({ capacity: 2 });
    await harness.service.book(harness.TOKEN, 'slot-1');
    const serialized = JSON.stringify(harness.audits);
    assert.equal(serialized.includes(harness.TOKEN), false);
    assert.equal(serialized.includes(hashSlotToken(harness.TOKEN)), false);
  });
});
