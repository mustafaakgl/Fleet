import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DeliverySlotService } from './delivery-slot.service';
import { TenantContext } from '../tenant/tenant-context';
import { hashSlotToken } from './core/delivery-slot-security';

/**
 * SLOT API YUZEYI (Faz 17f).
 *
 * 17e servis cekirdegini (token guvenligi, kapasite yarisi, es hata cevaplari)
 * `delivery-slot.spec.ts` olcuyor. BU DOSYA yalnizca 17f'de acilan yuzeyi
 * olcuyor: davet listesi, yeniden uretim, slot/kapasite yonetimi ve PUBLIC
 * IPTAL.
 *
 * KIRACI KAPSAMI TAKLIT EDILIYOR: kapsamli istemci yalnizca aktif kiracinin
 * satirlarini gorur, `unscoped` hepsini. Taklit etmeseydik "baska kiracinin
 * slotu yok gorunur" iddiasi hicbir sey kanitlamazdi.
 */

type Row = Record<string, unknown>;

const TENANT = 't1';
const TOKEN = 'test-token-0123456789abcdefghijklmnop';

interface BuildOptions {
  invitationStatus?: string;
  booked?: boolean;
  slotStartsAt?: string;
  bookedCount?: number;
  capacity?: number;
  locationTimeZone?: string | null;
}

function build(options: BuildOptions = {}) {
  const invitations: Row[] = [
    {
      id: 'inv-1',
      tenantId: TENANT,
      consignmentId: 'con-1',
      kind: 'delivery',
      tokenHash: hashSlotToken(TOKEN),
      tokenPrefix: TOKEN.slice(0, 8),
      status: options.invitationStatus ?? (options.booked ? 'booked' : 'open'),
      expiresAt: new Date('2026-09-10T00:00:00.000Z'),
      sourceRevision: 3,
      attemptCount: 0,
      lockedUntil: null,
      activeTargetKey: options.booked ? null : 'con-1:delivery',
      createdAt: new Date('2026-09-01T06:00:00.000Z'),
      consignment: {
        id: 'con-1',
        pickupLocationId: 'loc-pickup',
        deliveryLocationId: 'loc-delivery',
        transportOrder: { currentRevision: 3, status: 'confirmed' },
      },
    },
  ];

  const slots: Row[] = [
    {
      id: 'slot-1',
      tenantId: TENANT,
      locationId: 'loc-delivery',
      startsAt: new Date(options.slotStartsAt ?? '2026-09-03T08:00:00.000Z'),
      endsAt: new Date('2026-09-03T10:00:00.000Z'),
      timezone: 'Europe/Berlin',
      resourceRef: '',
      capacity: options.capacity ?? 2,
      bookedCount: options.bookedCount ?? (options.booked ? 1 : 0),
      status: 'open',
    },
    {
      id: 'slot-2',
      tenantId: TENANT,
      locationId: 'loc-delivery',
      startsAt: new Date('2026-09-04T08:00:00.000Z'),
      endsAt: new Date('2026-09-04T10:00:00.000Z'),
      timezone: 'Europe/Berlin',
      resourceRef: 'Rampe 2',
      capacity: 2,
      bookedCount: 0,
      status: 'open',
    },
    {
      id: 'slot-other-tenant',
      tenantId: 't2',
      locationId: 'loc-delivery',
      startsAt: new Date('2026-09-03T08:00:00.000Z'),
      endsAt: new Date('2026-09-03T10:00:00.000Z'),
      timezone: 'Europe/Berlin',
      resourceRef: '',
      capacity: 5,
      bookedCount: 0,
      status: 'open',
    },
  ];

  const bookings: Row[] = options.booked
    ? [
        {
          id: 'bk-1',
          tenantId: TENANT,
          invitationId: 'inv-1',
          slotId: 'slot-1',
          activeInvitationId: 'inv-1',
          bookedAt: new Date('2026-09-01T07:00:00.000Z'),
          cancelledAt: null,
        },
      ]
    : [];

  const locations: Row[] = [
    { id: 'loc-delivery', tenantId: TENANT, timezone: options.locationTimeZone ?? null },
    { id: 'loc-other-tenant', tenantId: 't2', timezone: null },
  ];
  const tenants: Row[] = [{ id: TENANT, timezone: 'Europe/Istanbul' }];
  const consignments: Row[] = [
    {
      id: 'con-1',
      tenantId: TENANT,
      transportOrderId: 'ord-1',
      transportOrder: { id: 'ord-1', status: 'confirmed', currentRevision: 3 },
    },
  ];
  const proposals: Row[] = [
    { id: 'dp-1', tenantId: TENANT, generation: 'ready', status: 'open', resultTourId: null, activeFingerprint: 'fp' },
  ];
  const audits: Row[] = [];
  let seq = 100;

  const unique = (): never => {
    throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
  };

  /** `scoped` true ise yalnizca aktif kiracinin satirlari gorunur. */
  function table(rows: Row[], scoped: boolean) {
    const visible = () => (scoped ? rows.filter((row) => row.tenantId === TENANT) : rows);
    return {
      async count() {
        return visible().length;
      },
      async findMany({ where }: { where?: Row } = {}) {
        return visible().filter((row) => matches(row, where ?? {}));
      },
      async findFirst({ where }: { where?: Row } = {}) {
        return visible().find((row) => matches(row, where ?? {})) ?? null;
      },
      async findUnique({ where }: { where: Row }) {
        return visible().find((row) => matches(row, where)) ?? null;
      },
      async create({ data }: { data: Row }) {
        if (
          data.activeTargetKey &&
          rows.some((row) => row.activeTargetKey && row.activeTargetKey === data.activeTargetKey)
        ) {
          unique();
        }
        if (
          data.locationId &&
          rows.some(
            (row) =>
              row.locationId === data.locationId &&
              (row.startsAt as Date | undefined)?.getTime() === (data.startsAt as Date).getTime() &&
              row.resourceRef === data.resourceRef,
          )
        ) {
          unique();
        }
        const row: Row = {
          id: `row-${(seq += 1)}`,
          tenantId: TENANT,
          bookedCount: 0,
          status: 'open',
          cancelledAt: null,
          ...data,
        };
        rows.push(row);
        return row;
      },
      async update({ where, data }: { where: Row; data: Row }) {
        const row = visible().find((entry) => entry.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return row;
      },
      async updateMany({ where, data }: { where: Row; data: Row }) {
        let count = 0;
        for (const row of visible()) {
          if (!matches(row, where)) continue;
          for (const [key, value] of Object.entries(data)) {
            const delta = value as { increment?: number; decrement?: number } | undefined;
            if (delta && typeof delta === 'object' && ('increment' in delta || 'decrement' in delta)) {
              row[key] = (row[key] as number) + (delta.increment ?? 0) - (delta.decrement ?? 0);
              continue;
            }
            row[key] = value;
          }
          count += 1;
        }
        return { count };
      },
    };
  }

  function matches(row: Row, where: Row): boolean {
    for (const [key, expected] of Object.entries(where)) {
      const actual = row[key];
      if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
        const range = expected as { lt?: number; gt?: number; gte?: number };
        if (range.lt !== undefined && !((actual as number) < range.lt)) return false;
        if (range.gt !== undefined && !((actual as number) > range.gt)) return false;
        if (range.gte !== undefined && !((actual as number) >= range.gte)) return false;
        continue;
      }
      if (expected instanceof Date) {
        if ((actual as Date | undefined)?.getTime() !== expected.getTime()) return false;
        continue;
      }
      if (actual !== expected) return false;
    }
    return true;
  }

  /**
   * Davet listesi ic ice `bookings` okuyor; taklit onu da cozmeli, yoksa
   * "aktif rezervasyon gosteriliyor" iddiasi olculemez.
   */
  function invitationTable(scoped: boolean) {
    const base = table(invitations, scoped);
    return {
      ...base,
      async findMany(args: { where?: Row } = {}) {
        const rows = await base.findMany(args);
        return rows.map((row) => ({
          ...row,
          bookings: bookings.filter(
            (booking) => booking.invitationId === row.id && booking.cancelledAt === null,
          ),
        }));
      },
    };
  }

  function clientFor(scoped: boolean) {
    return {
      deliverySlotInvitation: invitationTable(scoped),
      deliverySlot: table(slots, scoped),
      deliverySlotBooking: table(bookings, scoped),
      location: table(locations, scoped),
      consignment: table(consignments, scoped),
      dispatchProposal: table(proposals, scoped),
      tenant: table(tenants, false),
    };
  }

  const scopedClient = clientFor(true);
  const prisma = {
    ...scopedClient,
    unscoped: clientFor(false),
    async $transaction<T>(body: (tx: typeof scopedClient) => Promise<T>): Promise<T> {
      return body(clientFor(false));
    },
  };

  const audit = {
    async logAction(entry: Row) {
      audits.push(entry);
      return {};
    },
  };

  const service = new DeliverySlotService(prisma as never, audit as never);
  /** Kiraci baglami olmadan `resolveTenantTimeZone` calisamaz — gercekte de. */
  const run = <T>(fn: () => Promise<T>): Promise<T> => TenantContext.run(TENANT, fn);

  return { service, run, invitations, slots, bookings, audits, locations };
}

// ---------------------------------------------------------------------------
// Rol kapisi — SERVIS KATMANI
// ---------------------------------------------------------------------------

describe('Slot yonetimi rolleri — servis ikinci kapi', () => {
  const denied = ['accounting', 'driver', 'customer', undefined] as const;

  it('MUHASEBE ve SURUCU davet listeleyemez', async () => {
    for (const role of denied) {
      const harness = build();
      await assert.rejects(
        () => harness.run(() => harness.service.listInvitations(role, {})),
        (error: unknown) => error instanceof ForbiddenException,
        String(role),
      );
    }
  });

  it('MUHASEBE ve SURUCU slot acamaz ve degistiremez', async () => {
    for (const role of denied) {
      const harness = build();
      await assert.rejects(
        () =>
          harness.run(() =>
            harness.service.createSlot('u-1', role, {
              locationId: 'loc-delivery',
              startsAt: '2026-09-04T08:00:00.000Z',
              endsAt: '2026-09-04T10:00:00.000Z',
              capacity: 2,
            }),
          ),
        (error: unknown) => error instanceof ForbiddenException,
        String(role),
      );
      await assert.rejects(
        () => harness.run(() => harness.service.updateSlot('u-1', role, 'slot-1', { capacity: 5 })),
        (error: unknown) => error instanceof ForbiddenException,
        String(role),
      );
      await assert.rejects(
        () => harness.run(() => harness.service.reissueInvitation('u-1', role, 'inv-1')),
        (error: unknown) => error instanceof ForbiddenException,
        String(role),
      );
    }
  });

  it('operasyon yazma rolleri gecebiliyor', async () => {
    for (const role of ['admin', 'boss', 'office'] as const) {
      const harness = build();
      const page = await harness.run(() => harness.service.listInvitations(role, {}));
      assert.equal(page.total, 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Davet listesi
// ---------------------------------------------------------------------------

describe('Davet listesi', () => {
  it('TOKEN ve OZETI yanitta YOK — yalnizca kirilmis onek', async () => {
    const harness = build();
    const page = await harness.run(() => harness.service.listInvitations('office', {}));
    const row = page.rows[0]!;
    const serialized = JSON.stringify(row);

    assert.equal(row.tokenPrefix, TOKEN.slice(0, 8));
    assert.equal(serialized.includes(hashSlotToken(TOKEN)), false);
    assert.equal(serialized.includes(TOKEN), false);
    assert.equal('tokenHash' in row, false);
  });

  it('kilit durumu EVET/HAYIR — bitis zamani sizmiyor', async () => {
    const harness = build();
    harness.invitations[0]!.lockedUntil = new Date('2099-01-01T00:00:00.000Z');
    const page = await harness.run(() => harness.service.listInvitations('office', {}));
    assert.equal(page.rows[0]!.locked, true);
    assert.equal('lockedUntil' in page.rows[0]!, false);
  });

  it('sayfalama ust siniri uygulaniyor', async () => {
    const harness = build();
    assert.equal((await harness.run(() => harness.service.listInvitations('office', {}))).pageSize, 25);
    assert.equal(
      (await harness.run(() => harness.service.listInvitations('office', { pageSize: 5000 }))).pageSize,
      100,
    );
  });

  it('aktif rezervasyon gosteriliyor', async () => {
    const harness = build({ booked: true });
    const page = await harness.run(() => harness.service.listInvitations('office', {}));
    assert.equal(page.rows[0]!.activeBooking?.slotId, 'slot-1');
  });
});

// ---------------------------------------------------------------------------
// Yeniden davet
// ---------------------------------------------------------------------------

describe('Yeniden davet', () => {
  it('eskisi IPTAL edilir, yenisi DUZ METIN token doner', async () => {
    const harness = build();
    const result = await harness.run(() => harness.service.reissueInvitation('u-1', 'office', 'inv-1'));

    assert.ok(result.token.length > 20);
    assert.equal(harness.invitations[0]!.status, 'revoked');
    assert.equal(harness.invitations.length, 2);
    // Yeni davet AYNI hedefte ve aktif.
    assert.equal(harness.invitations[1]!.activeTargetKey, 'con-1:delivery');
  });

  it('DB`de yalnizca OZET duruyor', async () => {
    const harness = build();
    const result = await harness.run(() => harness.service.reissueInvitation('u-1', 'office', 'inv-1'));
    const created = harness.invitations[1]!;
    assert.equal(created.tokenHash, hashSlotToken(result.token));
    assert.equal(created.token, undefined);
  });

  it('bilinmeyen davet 404', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.run(() => harness.service.reissueInvitation('u-1', 'office', 'yok')),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});

// ---------------------------------------------------------------------------
// Slot ve kapasite
// ---------------------------------------------------------------------------

describe('Slot acma', () => {
  it('DILIM SUNUCUDA: konumun dilimi yoksa KIRACININ dilimi', async () => {
    const harness = build({ locationTimeZone: null });
    const created = await harness.run(() =>
      harness.service.createSlot('u-1', 'office', {
        locationId: 'loc-delivery',
        startsAt: '2026-09-04T08:00:00.000Z',
        endsAt: '2026-09-04T10:00:00.000Z',
        capacity: 2,
      }),
    );
    // Sabit `Europe/Berlin` YOK: kiracinin kendi dilimi kullanildi.
    assert.equal(created.timezone, 'Europe/Istanbul');
  });

  it('konumun kendi dilimi KIRACIYI EZIYOR', async () => {
    const harness = build({ locationTimeZone: 'Europe/Warsaw' });
    const created = await harness.run(() =>
      harness.service.createSlot('u-1', 'office', {
        locationId: 'loc-delivery',
        startsAt: '2026-09-04T08:00:00.000Z',
        endsAt: '2026-09-04T10:00:00.000Z',
        capacity: 2,
      }),
    );
    assert.equal(created.timezone, 'Europe/Warsaw');
  });

  it('ters ve sifir pencere REDDEDILIYOR', async () => {
    for (const [startsAt, endsAt] of [
      ['2026-09-04T10:00:00.000Z', '2026-09-04T08:00:00.000Z'],
      ['2026-09-04T08:00:00.000Z', '2026-09-04T08:00:00.000Z'],
    ]) {
      const harness = build();
      await assert.rejects(
        () =>
          harness.run(() =>
            harness.service.createSlot('u-1', 'office', {
              locationId: 'loc-delivery',
              startsAt: startsAt!,
              endsAt: endsAt!,
              capacity: 2,
            }),
          ),
        (error: unknown) => error instanceof BadRequestException,
      );
    }
  });

  it('BASKA KIRACININ konumu "yok" gorunur — 403 degil 404', async () => {
    const harness = build();
    await assert.rejects(
      () =>
        harness.run(() =>
          harness.service.createSlot('u-1', 'office', {
            locationId: 'loc-other-tenant',
            startsAt: '2026-09-04T08:00:00.000Z',
            endsAt: '2026-09-04T10:00:00.000Z',
            capacity: 2,
          }),
        ),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('ayni yer + kaynak + pencere IKINCI KEZ tanimlanamaz', async () => {
    const harness = build();
    await assert.rejects(
      () =>
        harness.run(() =>
          harness.service.createSlot('u-1', 'office', {
            locationId: 'loc-delivery',
            startsAt: '2026-09-03T08:00:00.000Z',
            endsAt: '2026-09-03T10:00:00.000Z',
            capacity: 2,
          }),
        ),
      (error: unknown) => error instanceof ConflictException,
    );
  });

  it('denetime tutar ve token yazilmiyor', async () => {
    const harness = build();
    await harness.run(() =>
      harness.service.createSlot('u-1', 'office', {
        locationId: 'loc-delivery',
        startsAt: '2026-09-04T08:00:00.000Z',
        endsAt: '2026-09-04T10:00:00.000Z',
        capacity: 2,
      }),
    );
    const serialized = JSON.stringify(harness.audits);
    for (const leak of ['token', 'Hash', 'revenue', 'price']) {
      assert.equal(serialized.toLowerCase().includes(leak.toLowerCase()), false, leak);
    }
  });
});

describe('Kapasite guncelleme', () => {
  it('kapasite MEVCUT REZERVASYONUN ALTINA indirilemez', async () => {
    const harness = build({ booked: true, bookedCount: 2, capacity: 3 });
    await assert.rejects(
      () => harness.run(() => harness.service.updateSlot('u-1', 'office', 'slot-1', { capacity: 1 })),
      (error: unknown) => error instanceof ConflictException,
    );
    // Hicbir sey degismedi.
    assert.equal(harness.slots[0]!.capacity, 3);
  });

  it('rezervasyon sayisina ESIT kapasite kabul ediliyor', async () => {
    const harness = build({ booked: true, bookedCount: 2, capacity: 3 });
    const updated = await harness.run(() =>
      harness.service.updateSlot('u-1', 'office', 'slot-1', { capacity: 2 }),
    );
    assert.equal(updated.capacity, 2);
    assert.equal(updated.remaining, 0);
  });

  it('slot KAPATILABILIYOR', async () => {
    const harness = build();
    const updated = await harness.run(() =>
      harness.service.updateSlot('u-1', 'office', 'slot-1', { status: 'closed' }),
    );
    assert.equal(updated.status, 'closed');
  });

  it('BASKA KIRACININ slotu 404', async () => {
    const harness = build();
    await assert.rejects(
      () => harness.run(() => harness.service.updateSlot('u-1', 'office', 'slot-other-tenant', { capacity: 1 })),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});

// ---------------------------------------------------------------------------
// Public degisiklik
// ---------------------------------------------------------------------------

/**
 * DEGISIKLIK 17e'DE ULASILAMAZ BIR DALDI.
 *
 * `book` daveti `allowBooked` olmadan cozuyordu; ilk rezervasyondan sonra
 * davet `booked` oldugu icin ikinci istek `resolveInvitation` kapisinda
 * duserdi ve musteri saatini DEGISTIREMEZDI. Asagidaki testler o dalin
 * gercekten calistigini olcuyor.
 */
describe('Public degisiklik', () => {
  it('FARKLI slot secimi: eskisi birakiliyor, yenisi aliniyor', async () => {
    const harness = build();
    const first = await harness.run(() => harness.service.book(TOKEN, 'slot-1'));
    const changed = await harness.run(() => harness.service.book(TOKEN, 'slot-2'));

    assert.equal(changed.repeated, false);
    assert.notEqual(changed.bookingId, first.bookingId);
    // Kontenjan dogru yer degistirdi.
    assert.equal(harness.slots.find((row) => row.id === 'slot-1')!.bookedCount, 0);
    assert.equal(harness.slots.find((row) => row.id === 'slot-2')!.bookedCount, 1);
  });

  it('degisiklikte ESKI kayit SILINMIYOR — gecmis duruyor', async () => {
    const harness = build();
    await harness.run(() => harness.service.book(TOKEN, 'slot-1'));
    await harness.run(() => harness.service.book(TOKEN, 'slot-2'));

    assert.equal(harness.bookings.length, 2);
    const released = harness.bookings.find((row) => row.slotId === 'slot-1')!;
    assert.equal(released.cancelReason, 'changed');
    assert.ok(released.cancelledAt);
    assert.equal(released.activeInvitationId, null);
  });

  it('AYNI slot tekrar secilirse MEVCUT rezervasyon doner', async () => {
    const harness = build();
    const first = await harness.run(() => harness.service.book(TOKEN, 'slot-1'));
    const repeat = await harness.run(() => harness.service.book(TOKEN, 'slot-1'));

    assert.equal(repeat.repeated, true);
    assert.equal(repeat.bookingId, first.bookingId);
    assert.equal(harness.slots[0]!.bookedCount, 1);
  });

  it('ESKI slotun kesim suresi gectiyse degisiklik REDDEDILIYOR', async () => {
    const harness = build();
    await harness.run(() => harness.service.book(TOKEN, 'slot-1'));

    /**
     * ZAMANIN GECMESI FIXTURE UZERINDEN taklit ediliyor.
     *
     * Slotu bastan kesim suresi ICINDE kursaydik ILK rezervasyon zaten
     * `slot_not_selectable` ile duserdi ve degisiklik dalina hic
     * gelinemezdi — test yanlis sebeple yesil olurdu. Gercek senaryo bu:
     * musteri saati zamaninda secti, sonra son dakikada kacmak istiyor.
     */
    harness.slots.find((row) => row.id === 'slot-1')!.startsAt = new Date(
      Date.now() + 30 * 60 * 1000,
    );

    await assert.rejects(
      () => harness.run(() => harness.service.book(TOKEN, 'slot-2')),
      (error: unknown) =>
        error instanceof ConflictException &&
        JSON.stringify(error.getResponse()).includes('slot_change_cutoff'),
    );
    // Ilk rezervasyon YERINDE.
    assert.equal(harness.slots.find((row) => row.id === 'slot-1')!.bookedCount, 1);
    assert.equal(harness.slots.find((row) => row.id === 'slot-2')!.bookedCount, 0);
  });

  it('degisiklikten sonra IPTAL hala calisiyor', async () => {
    const harness = build();
    await harness.run(() => harness.service.book(TOKEN, 'slot-1'));
    await harness.run(() => harness.service.book(TOKEN, 'slot-2'));
    const cancelled = await harness.run(() => harness.service.cancelBooking(TOKEN));

    assert.equal(cancelled.cancelled, true);
    assert.equal(harness.slots.find((row) => row.id === 'slot-2')!.bookedCount, 0);
    assert.equal(harness.invitations[0]!.status, 'open');
  });
});

// ---------------------------------------------------------------------------
// Public iptal
// ---------------------------------------------------------------------------

describe('Public iptal', () => {
  it('kontenjani GERI VERIYOR ve daveti yeniden aciyor', async () => {
    const harness = build({ booked: true });
    const result = await harness.run(() => harness.service.cancelBooking(TOKEN));

    assert.equal(result.cancelled, true);
    assert.equal(harness.slots[0]!.bookedCount, 0);
    assert.equal(harness.invitations[0]!.status, 'open');
    // Musteri baska bir saat secebilsin diye hedef anahtari geri veriliyor.
    assert.equal(harness.invitations[0]!.activeTargetKey, 'con-1:delivery');
  });

  it('kayit SILINMIYOR — append-only gecmis', async () => {
    const harness = build({ booked: true });
    await harness.run(() => harness.service.cancelBooking(TOKEN));
    assert.equal(harness.bookings.length, 1);
    assert.ok(harness.bookings[0]!.cancelledAt);
    assert.equal(harness.bookings[0]!.cancelReason, 'cancelled_by_customer');
    assert.equal(harness.bookings[0]!.activeInvitationId, null);
  });

  it('IDEMPOTENT: ikinci iptal HATA DEGIL', async () => {
    const harness = build({ booked: true });
    await harness.run(() => harness.service.cancelBooking(TOKEN));
    const second = await harness.run(() => harness.service.cancelBooking(TOKEN));
    assert.equal(second.cancelled, false);
    // Kontenjan IKINCI KEZ geri verilmedi.
    assert.equal(harness.slots[0]!.bookedCount, 0);
  });

  it('KESIM SURESI icinde iptal REDDEDILIYOR', async () => {
    // Slot birazdan basliyor: depo rampayi ayirmis olur.
    const soon = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const harness = build({ booked: true, slotStartsAt: soon });
    await assert.rejects(
      () => harness.run(() => harness.service.cancelBooking(TOKEN)),
      (error: unknown) =>
        error instanceof ConflictException &&
        JSON.stringify(error.getResponse()).includes('slot_change_cutoff'),
    );
    // Rezervasyon DURUYOR.
    assert.equal(harness.bookings[0]!.cancelledAt, null);
  });

  /**
   * IPTAL DE AYNI GUVENLI CEVABI VERIYOR.
   *
   * Iptal ucu `booked` daveti kabul ediyor — ama SADECE onu. Suresi dolmus ya
   * da iptal edilmis bir token burada da ayirt EDILEMEZ; aksi halde saldirgan
   * "iptal denemesi" ile bir token'in gercekten var oldugunu ogrenirdi.
   */
  it('gecersiz, suresi dolmus ve iptal edilmis token AYNI cevabi verir', async () => {
    const cases: Array<[string, () => ReturnType<typeof build>, string]> = [
      ['gecersiz token', () => build({ booked: true }), 'uydurma-token-uzun-uzun-uzun-1234567890'],
      ['iptal edilmis', () => build({ invitationStatus: 'revoked' }), TOKEN],
      ['suresi dolmus', () => build({ invitationStatus: 'expired' }), TOKEN],
      ['kisa token', () => build({ booked: true }), 'kisa'],
    ];

    for (const [label, make, token] of cases) {
      const harness = make();
      await assert.rejects(
        () => harness.run(() => harness.service.cancelBooking(token)),
        (error: unknown) =>
          error instanceof NotFoundException &&
          JSON.stringify(error.getResponse()).includes('slot_invitation_invalid'),
        label,
      );
    }
  });

  it('denetim kaydinda token YOK', async () => {
    const harness = build({ booked: true });
    await harness.run(() => harness.service.cancelBooking(TOKEN));
    const serialized = JSON.stringify(harness.audits);
    assert.equal(serialized.includes(TOKEN), false);
    assert.equal(serialized.includes(hashSlotToken(TOKEN)), false);
  });

  it('iptal ACIK dispatch onerilerini gecersiz kiliyor', async () => {
    const harness = build({ booked: true });
    await harness.run(() => harness.service.cancelBooking(TOKEN));
    // Pencere degisti: eski pencereye dayanan plan artik gecerli degil.
    const audited = harness.audits.some((entry) => entry.action === 'delivery_slot.booking_cancelled');
    assert.equal(audited, true);
  });
});
