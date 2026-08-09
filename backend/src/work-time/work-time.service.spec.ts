import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, WorkTimeEventSource, WorkTimeEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { applyTenantScope } from '../tenant/tenant-prisma.extension';
import { WorkTimeService } from './work-time.service';

type SessionRow = { id: string; tenantId: string; driverId: string; startedAt: Date };

type EventRow = {
  id: string;
  tenantId: string;
  workSessionId: string;
  driverId: string;
  type: WorkTimeEventType;
  occurredAt: Date;
  source: WorkTimeEventSource;
  createdAt: Date;
  supersedesEventId: string | null;
  clientEventId: string | null;
  deviceId: string | null;
  assignmentId: string | null;
  tourId: string | null;
};

type Store = { sessions: SessionRow[]; events: EventRow[] };

function at(time: string): Date {
  return new Date(`2026-08-08T${time}:00.000Z`);
}

/** Ic ice AND/tenantId sarmalini duzlestirir — findMany kapsamlamasi boyle geliyor. */
function flatten(where: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!where) return {};
  const clauses = (where.AND as Array<Record<string, unknown>> | undefined) ?? [where];
  return Object.assign({}, ...clauses.map((clause) => ({ ...clause, AND: undefined })));
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    return row[key] === value;
  });
}

function createFakePrisma(store: Store) {
  let sequence = 0;

  function scope(model: string, operation: string, args: Record<string, unknown>) {
    const tenantId = TenantContext.getTenantId();
    return tenantId ? applyTenantScope(operation, args, tenantId, model) : args;
  }

  return {
    workSession: {
      findUnique: async (args: { where: Record<string, unknown> }) => {
        const where = scope('WorkSession', 'findUnique', args).where as Record<string, unknown>;
        return store.sessions.find((row) => matches(row, where)) ?? null;
      },
    },
    workTimeEvent: {
      findFirst: async (args: { where?: Record<string, unknown> }) => {
        const where = flatten(scope('WorkTimeEvent', 'findFirst', args).where as Record<string, unknown>);
        return store.events.find((row) => matches(row, where)) ?? null;
      },
      count: async (args: { where?: Record<string, unknown> }) => {
        const where = flatten(scope('WorkTimeEvent', 'count', args).where as Record<string, unknown>);
        return store.events.filter((row) => matches(row, where)).length;
      },
      findMany: async (args: { where?: Record<string, unknown> }) => {
        const where = flatten(scope('WorkTimeEvent', 'findMany', args).where as Record<string, unknown>);
        return store.events
          .filter((row) => matches(row, where))
          .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
          .map((row) => ({
            ...row,
            supersededBy: store.events.find((other) => other.supersedesEventId === row.id) ?? null,
          }));
      },
      create: async (args: { data: Record<string, unknown> }) => {
        const data = scope('WorkTimeEvent', 'create', args).data as Partial<EventRow>;
        const clientEventId = data.clientEventId ?? null;
        if (
          clientEventId &&
          store.events.some(
            (row) => row.clientEventId === clientEventId && row.tenantId === data.tenantId,
          )
        ) {
          throw new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        sequence += 1;
        const row: EventRow = {
          id: `event-${sequence}`,
          tenantId: data.tenantId ?? 'tenant-a',
          workSessionId: data.workSessionId as string,
          driverId: data.driverId as string,
          type: data.type as WorkTimeEventType,
          occurredAt: data.occurredAt as Date,
          source: data.source as WorkTimeEventSource,
          // Yazilma sirasi: ayni dakikaya dusen olaylarin ayiricisi.
          createdAt: new Date(2_000_000_000_000 + sequence),
          supersedesEventId: (data.supersedesEventId as string | null) ?? null,
          clientEventId,
          deviceId: (data.deviceId as string | null) ?? null,
          assignmentId: (data.assignmentId as string | null) ?? null,
          tourId: (data.tourId as string | null) ?? null,
        };
        store.events.push(row);
        return row;
      },
    },
  };
}

function createStore(overrides: Partial<Store> = {}): Store {
  return {
    sessions: [
      { id: 'session-a', tenantId: 'tenant-a', driverId: 'driver-a', startedAt: at('07:02') },
    ],
    events: [],
    ...overrides,
  };
}

function createService(store: Store): WorkTimeService {
  return new WorkTimeService(createFakePrisma(store) as unknown as PrismaService);
}

function clockIn(store: Store, time = '07:02'): void {
  store.events.push({
    id: 'event-in',
    tenantId: 'tenant-a',
    workSessionId: 'session-a',
    driverId: 'driver-a',
    type: WorkTimeEventType.clock_in,
    occurredAt: at(time),
    source: WorkTimeEventSource.driver_web,
    createdAt: new Date(1_000_000_000_000),
    supersedesEventId: null,
    clientEventId: null,
    deviceId: null,
    assignmentId: null,
    tourId: null,
  });
}

describe('WorkTimeService', () => {
  it('molayi yazar ve gun ozetini olaylardan hesaplar', async () => {
    const store = createStore();
    clockIn(store);
    const service = createService(store);

    const shift = await TenantContext.run('tenant-a', () =>
      service.appendEvent(
        {
          workSessionId: 'session-a',
          driverId: 'driver-a',
          type: WorkTimeEventType.break_start,
          source: WorkTimeEventSource.driver_web,
          occurredAt: at('10:14'),
        },
        at('10:35'),
      ),
    );

    assert.equal(shift.state, 'on_break');
    assert.equal(shift.breakMinutes, 21);
    assert.equal(shift.netMinutes, 192);
    assert.equal(shift.events.length, 2);
  });

  it('ayni clientEventId ile gelen tekrar gonderimi ikinci kez yazmaz', async () => {
    const store = createStore();
    clockIn(store);
    const service = createService(store);

    const input = {
      workSessionId: 'session-a',
      driverId: 'driver-a',
      type: WorkTimeEventType.break_start,
      source: WorkTimeEventSource.driver_mobile,
      occurredAt: at('10:14'),
      clientEventId: 'abc123',
    };

    await TenantContext.run('tenant-a', () => service.appendEvent(input, at('10:35')));
    const second = await TenantContext.run('tenant-a', () => service.appendEvent(input, at('10:35')));

    assert.equal(store.events.filter((row) => row.clientEventId === 'abc123').length, 1);
    assert.equal(second.state, 'on_break');
  });

  it('es zamanli ayni gonderimde benzersiz kisidi hataya cevirmez', async () => {
    const store = createStore();
    clockIn(store);
    const service = createService(store);

    const input = {
      workSessionId: 'session-a',
      driverId: 'driver-a',
      type: WorkTimeEventType.break_start,
      source: WorkTimeEventSource.driver_mobile,
      occurredAt: at('10:14'),
      clientEventId: 'race-1',
    };

    // Idempotency okumasi ikisinde de bos donuyor; ikinci yazma P2002 aliyor.
    const [first, second] = await TenantContext.run('tenant-a', () =>
      Promise.all([service.appendEvent(input, at('10:35')), service.appendEvent(input, at('10:35'))]),
    );

    assert.equal(store.events.filter((row) => row.clientEventId === 'race-1').length, 1);
    assert.equal(first.state, 'on_break');
    assert.equal(second.state, 'on_break');
  });

  it('gecersiz gecisi reddeder ve hicbir sey yazmaz', async () => {
    const store = createStore();
    clockIn(store);
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.appendEvent(
          {
            workSessionId: 'session-a',
            driverId: 'driver-a',
            type: WorkTimeEventType.break_end,
            source: WorkTimeEventSource.driver_web,
            occurredAt: at('10:44'),
          },
          at('11:00'),
        ),
      ),
      (error: unknown) =>
        error instanceof ConflictException &&
        (error.getResponse() as { code: string }).code === 'not_on_break',
    );

    assert.equal(store.events.length, 1);
  });

  it('olay kaydi bos eski vardiyada acilis olayini uretir', async () => {
    // Ozellik oncesi acilmis vardiya: hic olay yok. Mola dokunusu "vardiya
    // baslamadi" diye reddedilmemeli.
    const store = createStore();
    const service = createService(store);

    const shift = await TenantContext.run('tenant-a', () =>
      service.appendEvent(
        {
          workSessionId: 'session-a',
          driverId: 'driver-a',
          type: WorkTimeEventType.break_start,
          source: WorkTimeEventSource.driver_web,
          occurredAt: at('10:14'),
        },
        at('10:35'),
      ),
    );

    assert.equal(shift.events.length, 2);
    assert.equal(shift.events[0].type, WorkTimeEventType.clock_in);
    assert.equal(shift.events[0].source, WorkTimeEventSource.auto);
    assert.equal(shift.startedAt, at('07:02').toISOString());
    assert.equal(shift.state, 'on_break');
  });

  it('ileri tarihli olayi reddeder', async () => {
    const store = createStore();
    clockIn(store);
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-a', () =>
        service.appendEvent(
          {
            workSessionId: 'session-a',
            driverId: 'driver-a',
            type: WorkTimeEventType.break_start,
            source: WorkTimeEventSource.driver_web,
            occurredAt: at('12:00'),
          },
          at('10:35'),
        ),
      ),
      (error: unknown) => (error as { getResponse(): { code: string } }).getResponse().code === 'occurred_at_in_future',
    );

    assert.equal(store.events.length, 1);
  });

  it('ofis duzeltmesi icin ustu cizilmemis son cikisi bulur', async () => {
    const store = createStore();
    clockIn(store);
    const service = createService(store);

    await TenantContext.run('tenant-a', () =>
      service.appendEvent(
        {
          workSessionId: 'session-a',
          driverId: 'driver-a',
          type: WorkTimeEventType.clock_out,
          source: WorkTimeEventSource.driver_web,
          occurredAt: at('17:19'),
        },
        at('17:19'),
      ),
    );

    const original = await TenantContext.run('tenant-a', () => service.findLatestClockOut('session-a'));
    assert.ok(original);

    await TenantContext.run('tenant-a', () =>
      service.appendEvent(
        {
          workSessionId: 'session-a',
          driverId: 'driver-a',
          type: WorkTimeEventType.clock_out,
          source: WorkTimeEventSource.office,
          occurredAt: at('18:00'),
          supersedesEventId: original,
        },
        at('18:30'),
      ),
    );

    const shift = await TenantContext.run('tenant-a', () => service.getShift('session-a', at('18:30')));
    // Duzeltme saati ILERI aldi; ustu cizme olmasa orijinal cikis kazanirdi.
    assert.equal(shift.endedAt, at('18:00').toISOString());
    assert.equal(shift.events.find((row) => row.id === original)?.supersededBy !== null, true);

    // Ustu cizilmis cikis bir daha duzeltme hedefi olmaz.
    const next = await TenantContext.run('tenant-a', () => service.findLatestClockOut('session-a'));
    assert.notEqual(next, original);
  });

  it('baska tenant vardiyasina olay yazmaz', async () => {
    const store = createStore();
    clockIn(store);
    const service = createService(store);

    await assert.rejects(
      TenantContext.run('tenant-b', () =>
        service.appendEvent(
          {
            workSessionId: 'session-a',
            driverId: 'driver-a',
            type: WorkTimeEventType.break_start,
            source: WorkTimeEventSource.driver_web,
            occurredAt: at('10:14'),
          },
          at('10:35'),
        ),
      ),
      (error: unknown) => error instanceof NotFoundException,
    );
  });

  it('bilinmeyen vardiyanin ozetini reddeder', async () => {
    const service = createService(createStore());

    await assert.rejects(
      TenantContext.run('tenant-a', () => service.getShift('session-x')),
      (error: unknown) => error instanceof NotFoundException,
    );
  });
});
