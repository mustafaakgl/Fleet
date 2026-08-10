import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  BreakCandidateStatus,
  TachoWorkState,
  WorkTimeEventSource,
  WorkTimeEventType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BreakCandidateService } from './break-candidate.service';
import { WorkTimeService } from './work-time.service';

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
};

type CandidateRow = {
  id: string;
  tenantId: string;
  driverId: string;
  workSessionId: string;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  source: string;
  status: BreakCandidateStatus;
  decidedAt: Date | null;
  decidedById: string | null;
  decisionSource: WorkTimeEventSource | null;
  breakStartEventId: string | null;
  breakEndEventId: string | null;
  evidenceRestMinutes: number;
  evidenceRecordedBreakMinutes: number;
  evidenceActivityIds: string[];
  evidenceDddFileIds: string[];
};

type RestRow = {
  id: string;
  dddFileId: string | null;
  driverId: string;
  workState: TachoWorkState;
  startedAt: Date;
  endedAt: Date;
};

type Store = {
  events: EventRow[];
  candidates: CandidateRow[];
  rest: RestRow[];
  minMinutes: number | null;
};

function at(time: string): Date {
  return new Date(`2026-08-10T${time}:00.000Z`);
}

const SESSION = {
  id: 'session-a',
  tenantId: 'tenant-a',
  driverId: 'driver-a',
  startedAt: at('07:00'),
};

function createFakePrisma(store: Store) {
  let sequence = 0;

  const workTimeEvent = {
    findMany: async (args: { where?: { workSessionId?: string; type?: WorkTimeEventType } }) => {
      const where = args.where ?? {};
      return store.events
        .filter((row) => !where.workSessionId || row.workSessionId === where.workSessionId)
        .filter((row) => !where.type || row.type === where.type)
        .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime())
        .map((row) => ({ ...row, supersededBy: null }));
    },
    count: async (args: { where?: { workSessionId?: string } }) =>
      store.events.filter((row) => row.workSessionId === args.where?.workSessionId).length,
    create: async (args: { data: Record<string, unknown> }) => {
      sequence += 1;
      const row: EventRow = {
        id: `event-${sequence}`,
        tenantId: 'tenant-a',
        workSessionId: args.data.workSessionId as string,
        driverId: args.data.driverId as string,
        type: args.data.type as WorkTimeEventType,
        occurredAt: args.data.occurredAt as Date,
        source: args.data.source as WorkTimeEventSource,
        createdAt: new Date(2_000_000_000_000 + sequence),
        supersedesEventId: null,
        clientEventId: null,
      };
      store.events.push(row);
      return row;
    },
  };

  return {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({ workTimeEvent }),
    workSession: {
      findUnique: async () => ({
        ...SESSION,
        timeEvents: store.events.filter((row) => row.workSessionId === SESSION.id),
      }),
    },
    workTimeEvent,
    tachoActivity: {
      findMany: async (args: { where: { workState: TachoWorkState } }) =>
        store.rest.filter((row) => row.workState === args.where.workState),
    },
    tenantPayrollProfile: {
      findFirst: async () =>
        store.minMinutes === null ? null : { breakCandidateMinMinutes: store.minMinutes },
    },
    breakCandidate: {
      findMany: async (args: { where?: { workSessionId?: string; status?: BreakCandidateStatus; startedAt?: { in?: Date[] } } }) => {
        const where = args.where ?? {};
        const wanted = where.startedAt?.in?.map((date) => date.getTime());
        return store.candidates
          .filter((row) => !where.workSessionId || row.workSessionId === where.workSessionId)
          .filter((row) => !where.status || row.status === where.status)
          .filter((row) => !wanted || wanted.includes(row.startedAt.getTime()))
          .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime());
      },
      findUnique: async (args: { where: { id: string } }) =>
        store.candidates.find((row) => row.id === args.where.id) ?? null,
      create: async (args: { data: Record<string, unknown> }) => {
        sequence += 1;
        const row: CandidateRow = {
          id: `candidate-${sequence}`,
          tenantId: args.data.tenantId as string,
          driverId: args.data.driverId as string,
          workSessionId: args.data.workSessionId as string,
          startedAt: args.data.startedAt as Date,
          endedAt: args.data.endedAt as Date,
          durationMinutes: args.data.durationMinutes as number,
          source: 'tachograph',
          status: BreakCandidateStatus.pending,
          decidedAt: null,
          decidedById: null,
          decisionSource: null,
          breakStartEventId: null,
          breakEndEventId: null,
          evidenceRestMinutes: args.data.evidenceRestMinutes as number,
          evidenceRecordedBreakMinutes: args.data.evidenceRecordedBreakMinutes as number,
          evidenceActivityIds: args.data.evidenceActivityIds as string[],
          evidenceDddFileIds: args.data.evidenceDddFileIds as string[],
        };
        store.candidates.push(row);
        return row;
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = store.candidates.find((item) => item.id === args.where.id);
        if (!row) throw new Error('candidate missing');
        Object.assign(row, args.data);
        return row;
      },
      deleteMany: async (args: { where: { id: { in: string[] } } }) => {
        const ids = new Set(args.where.id.in);
        const before = store.candidates.length;
        store.candidates = store.candidates.filter((row) => !ids.has(row.id));
        return { count: before - store.candidates.length };
      },
    },
  };
}

function createStore(overrides: Partial<Store> = {}): Store {
  return {
    events: [
      {
        id: 'event-in',
        tenantId: 'tenant-a',
        workSessionId: SESSION.id,
        driverId: SESSION.driverId,
        type: WorkTimeEventType.clock_in,
        occurredAt: at('07:00'),
        source: WorkTimeEventSource.driver_web,
        createdAt: new Date(1_000_000_000_000),
        supersedesEventId: null,
        clientEventId: null,
      },
    ],
    candidates: [],
    rest: [],
    minMinutes: 15,
    ...overrides,
  };
}

function createService(store: Store): BreakCandidateService {
  const prisma = createFakePrisma(store) as unknown as PrismaService;
  return new BreakCandidateService(prisma, new WorkTimeService(prisma));
}

let restSequence = 0;

function rest(from: string, to: string, dddFileId: string | null = 'ddd-1'): RestRow {
  restSequence += 1;
  return {
    id: `activity-${restSequence}`,
    dddFileId,
    driverId: SESSION.driverId,
    workState: TachoWorkState.rest,
    startedAt: at(from),
    endedAt: at(to),
  };
}

describe('BreakCandidateService', () => {
  it('bekleyen aday uretir ama Zeiterfassung\'a DOKUNMAZ', async () => {
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    const service = createService(store);

    const candidates = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].status, BreakCandidateStatus.pending);
    assert.equal(candidates[0].durationMinutes, 41);
    // Modelin can alici noktasi: delil uretildi, kayit degismedi.
    assert.deepEqual(
      store.events.map((row) => row.type),
      [WorkTimeEventType.clock_in],
    );
  });

  it('ayni taramayi iki kez kosmak ikinci adayi uretmez', async () => {
    // Uretim her okumada kosuyor; idempotent olmasaydi surucu her ekran
    // acilista ayni molayi yeniden onaylamak zorunda kalirdi.
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    const service = createService(store);

    await service.syncSession(SESSION.id, at('17:19'));
    const second = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(second.length, 1);
    assert.equal(store.candidates.length, 1);
  });

  it('onay BREAK_START/BREAK_END yazar ve olaylari adaya baglar', async () => {
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    const service = createService(store);
    const [candidate] = await service.syncSession(SESSION.id, at('17:19'));

    const confirmed = await service.confirm(
      candidate.id,
      { userId: 'user-1', source: WorkTimeEventSource.driver_mobile },
      at('17:30'),
    );

    assert.equal(confirmed.status, BreakCandidateStatus.confirmed);
    const written = store.events.filter((row) => row.type !== WorkTimeEventType.clock_in);
    assert.deepEqual(
      written.map((row) => `${row.type}@${row.occurredAt.toISOString().slice(11, 16)}`),
      ['break_start@12:06', 'break_end@12:47'],
    );
    assert.equal(written[0].source, WorkTimeEventSource.driver_mobile);

    const row = store.candidates[0];
    assert.equal(row.breakStartEventId, written[0].id);
    assert.equal(row.breakEndEventId, written[1].id);
    assert.equal(row.decidedById, 'user-1');
  });

  it('onaylanan mola bir sonraki taramada yeniden aday olmaz', async () => {
    // Onay sonrasi o dinlenme artik kayitli; cikarma islemi geriye bir sey
    // birakmiyor. Aksi halde surucu ayni molayi ikinci kez onaylardi.
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    const service = createService(store);
    const [candidate] = await service.syncSession(SESSION.id, at('17:19'));
    await service.confirm(candidate.id, { userId: null, source: WorkTimeEventSource.office });

    const after = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(after.length, 1);
    assert.equal(after[0].status, BreakCandidateStatus.confirmed);
    assert.equal(store.candidates.length, 1);
  });

  it('reddedilen aday geri gelmez ve olay yazilmaz', async () => {
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    const service = createService(store);
    const [candidate] = await service.syncSession(SESSION.id, at('17:19'));

    await service.dismiss(candidate.id, { userId: 'user-1', source: WorkTimeEventSource.office });
    const after = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(after.length, 1);
    assert.equal(after[0].status, BreakCandidateStatus.dismissed);
    assert.deepEqual(
      store.events.map((row) => row.type),
      [WorkTimeEventType.clock_in],
    );
  });

  it('ayni adaya ikinci karari reddeder', async () => {
    // Surucu telefonundan, ofis ekranindan ayni adayi gorebiliyor; ikinci
    // onay sessizce gecerse ayni mola iki kez yazilirdi.
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    const service = createService(store);
    const [candidate] = await service.syncSession(SESSION.id, at('17:19'));
    await service.confirm(candidate.id, { userId: null, source: WorkTimeEventSource.office });

    await assert.rejects(
      () => service.confirm(candidate.id, { userId: null, source: WorkTimeEventSource.office }),
      ConflictException,
    );
  });

  it('surucunun kendi kaydettigi mola icin aday uretmez', async () => {
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    store.events.push(
      {
        id: 'event-bs',
        tenantId: 'tenant-a',
        workSessionId: SESSION.id,
        driverId: SESSION.driverId,
        type: WorkTimeEventType.break_start,
        occurredAt: at('12:05'),
        source: WorkTimeEventSource.driver_mobile,
        createdAt: new Date(1_000_000_000_001),
        supersedesEventId: null,
        clientEventId: null,
      },
      {
        id: 'event-be',
        tenantId: 'tenant-a',
        workSessionId: SESSION.id,
        driverId: SESSION.driverId,
        type: WorkTimeEventType.break_end,
        occurredAt: at('12:48'),
        source: WorkTimeEventSource.driver_mobile,
        createdAt: new Date(1_000_000_000_002),
        supersedesEventId: null,
        clientEventId: null,
      },
    );
    const service = createService(store);

    assert.deepEqual(await service.syncSession(SESSION.id, at('17:19')), []);
  });

  it('bekleyen adayin uzayan bitisini gunceller', async () => {
    // DDD dosyasi ayni dinlenmenin devamini sonra getirebiliyor.
    const store = createStore({ rest: [rest('12:06', '12:30')] });
    const service = createService(store);
    await service.syncSession(SESSION.id, at('17:19'));

    store.rest = [rest('12:06', '12:47')];
    const after = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(store.candidates.length, 1);
    assert.equal(after[0].durationMinutes, 41);
  });

  it('karara baglanmis adayin bitisini DEGISTIRMEZ', async () => {
    // Onaylanmis adayin araligi degisirse yazilan olaylarla bagi kopardi.
    const store = createStore({ rest: [rest('12:06', '12:30')] });
    const service = createService(store);
    const [candidate] = await service.syncSession(SESSION.id, at('17:19'));
    await service.dismiss(candidate.id, { userId: null, source: WorkTimeEventSource.office });

    store.rest = [rest('12:06', '12:47')];
    const after = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(after[0].durationMinutes, 24);
    assert.equal(after[0].status, BreakCandidateStatus.dismissed);
  });

  it('esigi tenant profilinden okur', async () => {
    const store = createStore({ rest: [rest('12:00', '12:20')], minMinutes: 30 });
    const service = createService(store);

    assert.deepEqual(await service.syncSession(SESSION.id, at('17:19')), []);
  });

  it('gec gelen DAHA EKSIKSIZ DDD bekleyen adayi buyutur', async () => {
    // Idempotency, daha kaliteli veriyi yok saymak demek degil: ilk tarama
    // 20 dakika gorduyse ve dosya sonradan 47 dakika oldugunu gosteriyorsa
    // aday 20'de donup kalmamali.
    const store = createStore({ rest: [rest('12:00', '12:20')] });
    const service = createService(store);
    const [first] = await service.syncSession(SESSION.id, at('17:19'));
    assert.equal(first.durationMinutes, 20);

    store.rest = [rest('12:00', '12:47')];
    const [second] = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(store.candidates.length, 1, 'ayni aday guncellenmeli, ikincisi acilmamali');
    assert.equal(second.id, first.id);
    assert.equal(second.durationMinutes, 47);
    assert.equal(store.candidates[0].evidenceRestMinutes, 47);
  });

  it('gec gelen veri ONAYLANMIS adayin araligini degistirmez', async () => {
    // Karar verilmis adayin araligi kaysaydi yazilan olaylarla bagi kopardi.
    const store = createStore({ rest: [rest('12:00', '12:20')] });
    const service = createService(store);
    const [candidate] = await service.syncSession(SESSION.id, at('17:19'));
    await service.confirm(candidate.id, { userId: null, source: WorkTimeEventSource.office });

    store.rest = [rest('12:00', '12:47')];
    const after = await service.syncSession(SESSION.id, at('17:19'));

    const confirmed = after.find((row) => row.id === candidate.id);
    assert.equal(confirmed?.durationMinutes, 20);
    assert.equal(confirmed?.status, BreakCandidateStatus.confirmed);
  });

  it('artik turetilemeyen bekleyen adayi geri ceker', async () => {
    // Surucu o molayi elle kaydederse eski oneri gecerliligini yitirir;
    // birakilirsa onaylandiginda YANLIS mola yazan bir satir olurdu.
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    const service = createService(store);
    await service.syncSession(SESSION.id, at('17:19'));
    assert.equal(store.candidates.length, 1);

    store.events.push(
      {
        id: 'event-bs',
        tenantId: 'tenant-a',
        workSessionId: SESSION.id,
        driverId: SESSION.driverId,
        type: WorkTimeEventType.break_start,
        occurredAt: at('12:00'),
        source: WorkTimeEventSource.driver_mobile,
        createdAt: new Date(1_000_000_000_010),
        supersedesEventId: null,
        clientEventId: null,
      },
      {
        id: 'event-be',
        tenantId: 'tenant-a',
        workSessionId: SESSION.id,
        driverId: SESSION.driverId,
        type: WorkTimeEventType.break_end,
        occurredAt: at('12:50'),
        source: WorkTimeEventSource.driver_mobile,
        createdAt: new Date(1_000_000_000_011),
        supersedesEventId: null,
        clientEventId: null,
      },
    );

    assert.deepEqual(await service.syncSession(SESSION.id, at('17:19')), []);
    assert.equal(store.candidates.length, 0);
  });

  it('takograf verisi duzelip baslangic kayarsa iki oneri birakmaz', async () => {
    const store = createStore({ rest: [rest('12:00', '12:47')] });
    const service = createService(store);
    await service.syncSession(SESSION.id, at('17:19'));

    store.rest = [rest('12:10', '12:47')];
    const after = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(after.length, 1);
    assert.equal(after[0].startedAt, at('12:10').toISOString());
  });

  it('geri cekme KARARA BAGLANMIS adaylara dokunmaz', async () => {
    const store = createStore({ rest: [rest('12:06', '12:47')] });
    const service = createService(store);
    const [candidate] = await service.syncSession(SESSION.id, at('17:19'));
    await service.dismiss(candidate.id, { userId: null, source: WorkTimeEventSource.office });

    store.rest = [];
    const after = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(after.length, 1);
    assert.equal(after[0].status, BreakCandidateStatus.dismissed);
  });

  it('onerinin gerekcesini kaydeder', async () => {
    // "Bu 17 dakikayi neden onerdiniz?" -> takograf 47, kayitli 30, fark 17,
    // ve hangi DDD dosyasindan geldigi.
    const store = createStore({ rest: [rest('12:00', '12:47', 'ddd-august')] });
    store.events.push(
      {
        id: 'event-bs',
        tenantId: 'tenant-a',
        workSessionId: SESSION.id,
        driverId: SESSION.driverId,
        type: WorkTimeEventType.break_start,
        occurredAt: at('12:00'),
        source: WorkTimeEventSource.driver_mobile,
        createdAt: new Date(1_000_000_000_010),
        supersedesEventId: null,
        clientEventId: null,
      },
      {
        id: 'event-be',
        tenantId: 'tenant-a',
        workSessionId: SESSION.id,
        driverId: SESSION.driverId,
        type: WorkTimeEventType.break_end,
        occurredAt: at('12:30'),
        source: WorkTimeEventSource.driver_mobile,
        createdAt: new Date(1_000_000_000_011),
        supersedesEventId: null,
        clientEventId: null,
      },
    );
    const service = createService(store);

    const [candidate] = await service.syncSession(SESSION.id, at('17:19'));

    assert.equal(candidate.durationMinutes, 17);
    const row = store.candidates[0];
    assert.equal(row.evidenceRestMinutes, 47);
    assert.equal(row.evidenceRecordedBreakMinutes, 30);
    assert.deepEqual(row.evidenceDddFileIds, ['ddd-august']);
    assert.equal(row.evidenceActivityIds.length, 1);
  });

  it('bilinmeyen adayi reddeder', async () => {
    const service = createService(createStore());

    await assert.rejects(
      () => service.confirm('yok', { userId: null, source: WorkTimeEventSource.office }),
      NotFoundException,
    );
  });
});
