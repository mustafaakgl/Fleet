import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WorkTimeEventSource, WorkTimeEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAppendWorkTimeEvent,
  foldWorkTimeEvents,
  type FoldableWorkTimeEvent,
  type WorkTimeAnomaly,
  type WorkTimeEventKind,
  type WorkTimeState,
} from './core/work-time-fold.util';

/**
 * Zeiterfassung yazma yolu.
 *
 * Kayit APPEND-ONLY: bu serviste guncelleme ve silme yok. Duzeltme bile yeni
 * bir olay yazip eskisinin ustunu cizerek yapiliyor. Gunun toplami saklanmiyor,
 * her okumada olaylardan yeniden hesaplaniyor.
 *
 * WorkSession'a DOKUNULMUYOR: vardiyanin kabi, aktif/bitti durumu ve stale
 * mantigi orada kaliyor; bu servis onun icindeki detayi tutuyor.
 */

/** Cihaz saati kayabilir; bu kadarini tolere ediyoruz, otesi veri hatasi. */
const FUTURE_TOLERANCE_MINUTES = 15;

export type AppendWorkTimeEventInput = {
  workSessionId: string;
  driverId: string;
  type: WorkTimeEventType;
  source: WorkTimeEventSource;
  /** Cevrimdisi yakalanan an; verilmezse sunucu saati. */
  occurredAt?: string | Date;
  clientEventId?: string | null;
  deviceId?: string | null;
  assignmentId?: string | null;
  tourId?: string | null;
  latitude?: number;
  longitude?: number;
  /** Ustu cizilecek onceki olay — ofis duzeltmesi bunu kullanir. */
  supersedesEventId?: string | null;
};

export type WorkTimeEventView = {
  id: string;
  type: WorkTimeEventType;
  occurredAt: string;
  source: WorkTimeEventSource;
  supersededBy: string | null;
};

export type WorkTimeShiftView = {
  workSessionId: string;
  driverId: string;
  state: WorkTimeState;
  startedAt: string | null;
  endedAt: string | null;
  grossMinutes: number;
  breakMinutes: number;
  netMinutes: number;
  requiredBreakMinutes: number;
  anomalies: WorkTimeAnomaly[];
  events: WorkTimeEventView[];
};

type StoredEvent = {
  id: string;
  type: WorkTimeEventType;
  occurredAt: Date;
  source: WorkTimeEventSource;
  createdAt: Date;
  supersedesEventId: string | null;
};

const STORED_EVENT_SELECT = {
  id: true,
  type: true,
  occurredAt: true,
  source: true,
  createdAt: true,
  supersedesEventId: true,
} satisfies Prisma.WorkTimeEventSelect;

function toFoldable(rows: StoredEvent[]): FoldableWorkTimeEvent[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type as WorkTimeEventKind,
    occurredAt: row.occurredAt,
    // Ayni dakikaya dusen olaylarda yazilma sirasi ayirici.
    sequence: row.createdAt.getTime(),
    supersedesEventId: row.supersedesEventId,
  }));
}

function parseOccurredAt(value: string | Date | undefined, now: Date): Date {
  if (value === undefined) return now;
  const parsed = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException({ code: 'invalid_occurred_at' });
  }
  if (parsed.getTime() > now.getTime() + FUTURE_TOLERANCE_MINUTES * 60_000) {
    throw new BadRequestException({ code: 'occurred_at_in_future' });
  }
  return parsed;
}

@Injectable()
export class WorkTimeService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadEvents(workSessionId: string): Promise<StoredEvent[]> {
    return this.prisma.workTimeEvent.findMany({
      where: { workSessionId },
      select: STORED_EVENT_SELECT,
      orderBy: { occurredAt: 'asc' },
    });
  }

  /**
   * Olay kaydi bu ozellikten ONCE acilmis vardiyalarda bos. Boyle bir vardiyada
   * surucu molaya basarsa veya ofis duzeltme yaparsa gecis "vardiya baslamadi"
   * diye reddedilirdi. Acilis olayi WorkSession.startedAt'ten uretilir —
   * uydurma degil, zaten kayitli olan baslangic; `auto` kaynagi bunun surucu
   * dokunusu OLMADIGINI belgeler. Veri gocu gerekmiyor, ilk dokunusta olusuyor.
   */
  private async ensureOpeningEvent(
    session: { id: string; driverId: string; startedAt: Date },
    incoming: WorkTimeEventType,
  ): Promise<void> {
    if (incoming === WorkTimeEventType.clock_in) return;

    const count = await this.prisma.workTimeEvent.count({ where: { workSessionId: session.id } });
    if (count > 0) return;

    await this.prisma.workTimeEvent.create({
      data: {
        workSessionId: session.id,
        driverId: session.driverId,
        type: WorkTimeEventType.clock_in,
        occurredAt: session.startedAt,
        source: WorkTimeEventSource.auto,
      },
    });
  }

  /**
   * Yeni olay yazar.
   *
   * Sira: once idempotency (ayni clientEventId ikinci kez yazilmaz), sonra
   * gecis kontrolu, sonra yazma. Es zamanli iki ayni istek ikisi de kontrolu
   * gecerse benzersiz kisit ikincisini durdurur ve mevcut durum dondurulur —
   * cevrimdisi kuyruk tekrar gonderiminde hata gormemeli.
   */
  async appendEvent(input: AppendWorkTimeEventInput, asOf: Date = new Date()): Promise<WorkTimeShiftView> {
    const occurredAt = parseOccurredAt(input.occurredAt, asOf);
    const clientEventId = input.clientEventId?.trim() || null;

    // Vardiya kapsamli okunuyor: baska tenant'in vardiyasi burada zaten
    // gorunmuyor. Kontrol ONCE yapiliyor ki reddin sebebi "yok" olsun —
    // aksi halde bos olay listesi uzerinden anlamsiz bir gecis hatasi donerdi.
    const session = await this.prisma.workSession.findUnique({
      where: { id: input.workSessionId },
      select: { id: true, driverId: true, startedAt: true },
    });
    if (!session) {
      throw new NotFoundException({ code: 'work_session_not_found' });
    }

    if (clientEventId) {
      const duplicate = await this.prisma.workTimeEvent.findFirst({
        where: { clientEventId },
        select: { workSessionId: true },
      });
      if (duplicate) {
        return this.getShift(duplicate.workSessionId, asOf);
      }
    }

    await this.ensureOpeningEvent(session, input.type);

    const existing = await this.loadEvents(input.workSessionId);
    const decision = canAppendWorkTimeEvent(toFoldable(existing), {
      type: input.type as WorkTimeEventKind,
      occurredAt,
      supersedesEventId: input.supersedesEventId ?? null,
    });
    if (!decision.apply) {
      throw new ConflictException({ code: decision.reason });
    }

    try {
      await this.prisma.workTimeEvent.create({
        data: {
          workSessionId: input.workSessionId,
          driverId: input.driverId,
          type: input.type,
          occurredAt,
          source: input.source,
          assignmentId: input.assignmentId ?? null,
          tourId: input.tourId ?? null,
          latitude: input.latitude !== undefined ? new Prisma.Decimal(input.latitude) : null,
          longitude: input.longitude !== undefined ? new Prisma.Decimal(input.longitude) : null,
          clientEventId,
          deviceId: input.deviceId?.trim() || null,
          supersedesEventId: input.supersedesEventId ?? null,
        },
      });
    } catch (error) {
      // Yaris: ayni clientEventId es zamanli iki kez geldi. Ikincisi kaybeder
      // ama cagirana hata donmez — olay zaten kayitli.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        clientEventId
      ) {
        return this.getShift(input.workSessionId, asOf);
      }
      throw error;
    }

    return this.getShift(input.workSessionId, asOf);
  }

  /** Vardiyanin o andaki ozeti. Toplamlar olaylardan hesaplanir, okunmaz. */
  async getShift(workSessionId: string, asOf: Date = new Date()): Promise<WorkTimeShiftView> {
    const session = await this.prisma.workSession.findUnique({
      where: { id: workSessionId },
      select: { id: true, driverId: true },
    });
    if (!session) {
      throw new NotFoundException({ code: 'work_session_not_found' });
    }

    const rows = await this.loadEvents(workSessionId);
    const folded = foldWorkTimeEvents(toFoldable(rows), asOf);
    const supersededBy = new Map<string, string>();
    for (const row of rows) {
      if (row.supersedesEventId) supersededBy.set(row.supersedesEventId, row.id);
    }

    return {
      workSessionId: session.id,
      driverId: session.driverId,
      state: folded.state,
      startedAt: folded.startedAt?.toISOString() ?? null,
      endedAt: folded.endedAt?.toISOString() ?? null,
      grossMinutes: folded.grossMinutes,
      breakMinutes: folded.breakMinutes,
      netMinutes: folded.netMinutes,
      requiredBreakMinutes: folded.requiredBreakMinutes,
      anomalies: folded.anomalies,
      events: rows.map((row) => ({
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt.toISOString(),
        source: row.source,
        supersededBy: supersededBy.get(row.id) ?? null,
      })),
    };
  }

  /**
   * Vardiyanin son gecerli cikis olayi. Ofis duzeltmesi bunun ustunu cizer.
   * Ustu zaten cizilmis olan dondurulmez, yoksa duzeltme zinciri dallanirdi.
   */
  async findLatestClockOut(workSessionId: string): Promise<string | null> {
    const rows = await this.prisma.workTimeEvent.findMany({
      where: { workSessionId, type: WorkTimeEventType.clock_out },
      select: { id: true, supersededBy: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.find((row) => !row.supersededBy)?.id ?? null;
  }
}
