import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BreakCandidateStatus,
  Prisma,
  TachoWorkState,
  WorkTimeEventSource,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveBreakCandidates,
  DEFAULT_BREAK_CANDIDATE_MIN_MINUTES,
} from './core/break-candidate.util';
import { foldWorkTimeEvents, type FoldableWorkTimeEvent } from './core/work-time-fold.util';
import { WorkTimeService } from './work-time.service';

/**
 * Mola adaylarinin uretimi ve karara baglanmasi.
 *
 * MODELIN OZU: takograf delil uretir, insan onaylar, bordro yalnizca onaylanmis
 * WorkTimeEvent'i okur. Bu servis ortadaki halka; hicbir yerde PayrollEntry'ye
 * dokunmuyor ve dokunmamali.
 *
 * Uretim TETIKLENMEZ, HER OKUMADA yeniden kosulur (`sync`). Sebep: takograf
 * verisi gec geliyor — DDD dosyasi gunler sonra inebiliyor ve o an bir olay
 * yayinlayacak guvenilir bir tetik yok. Idempotent uretim, "veri ne zaman
 * gelirse gelsin aday o an cikar" demenin en ucuz yolu.
 */

/** Sürücünün kendi kaydettigi mola araligi, katlamadan geliyor. */
const EVENT_SELECT = {
  id: true,
  type: true,
  occurredAt: true,
  createdAt: true,
  supersedesEventId: true,
} satisfies Prisma.WorkTimeEventSelect;

export type BreakCandidateView = {
  id: string;
  driverId: string;
  workSessionId: string;
  startedAt: string;
  endedAt: string;
  durationMinutes: number;
  status: BreakCandidateStatus;
  source: string;
  decidedAt: string | null;
  decisionSource: WorkTimeEventSource | null;
};

type SessionRow = {
  id: string;
  tenantId: string;
  driverId: string;
  timeEvents: Array<{
    id: string;
    type: string;
    occurredAt: Date;
    createdAt: Date;
    supersedesEventId: string | null;
  }>;
};

function toFoldable(rows: SessionRow['timeEvents']): FoldableWorkTimeEvent[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type as FoldableWorkTimeEvent['type'],
    occurredAt: row.occurredAt,
    sequence: row.createdAt.getTime(),
    supersedesEventId: row.supersedesEventId,
  }));
}

function toView(row: {
  id: string;
  driverId: string;
  workSessionId: string;
  startedAt: Date;
  endedAt: Date;
  durationMinutes: number;
  status: BreakCandidateStatus;
  source: string;
  decidedAt: Date | null;
  decisionSource: WorkTimeEventSource | null;
}): BreakCandidateView {
  return {
    id: row.id,
    driverId: row.driverId,
    workSessionId: row.workSessionId,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt.toISOString(),
    durationMinutes: row.durationMinutes,
    status: row.status,
    source: row.source,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    decisionSource: row.decisionSource,
  };
}

@Injectable()
export class BreakCandidateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workTime: WorkTimeService,
  ) {}

  private async minMinutes(): Promise<number> {
    const profile = await this.prisma.tenantPayrollProfile.findFirst({
      select: { breakCandidateMinMinutes: true },
    });
    return profile?.breakCandidateMinMinutes ?? DEFAULT_BREAK_CANDIDATE_MIN_MINUTES;
  }

  /**
   * Bir vardiyanin adaylarini tazeler ve gunceli dondurur.
   *
   * Var olan satirlara DOKUNMUYOR (durumu ne olursa olsun): onaylanmis bir aday
   * yeniden yazilirsa uretilen olayla bagi kopar, reddedilmis bir aday yeniden
   * `pending` olursa surucu ayni soruyu her acilista tekrar gorur. Yalnizca
   * HENUZ OLMAYAN baslangic anlari ekleniyor.
   *
   * Bekleyen bir adayin bitisi uzayabilir: DDD dosyasi ayni dinlenmenin devamini
   * sonra getirebiliyor. O durumda satir guncelleniyor — henuz karara
   * baglanmadigi icin guvenli.
   */
  async syncSession(workSessionId: string, asOf: Date = new Date()): Promise<BreakCandidateView[]> {
    const session = await this.prisma.workSession.findUnique({
      where: { id: workSessionId },
      select: {
        id: true,
        tenantId: true,
        driverId: true,
        timeEvents: { select: EVENT_SELECT },
      },
    });
    if (!session) {
      throw new NotFoundException({ code: 'work_session_not_found' });
    }

    const folded = foldWorkTimeEvents(toFoldable(session.timeEvents), asOf);
    // Vardiya penceresi: acik vardiyada "simdi"ye kadar. Kapanmamis vardiyada
    // da aday cikmali — surucu molasini gun icinde onaylayabiliyor.
    const shiftWindow =
      folded.startedAt !== null ? { from: folded.startedAt, to: folded.endedAt ?? asOf } : null;

    if (!shiftWindow) {
      return this.listForSession(workSessionId);
    }

    const restRows = await this.prisma.tachoActivity.findMany({
      where: {
        driverId: session.driverId,
        workState: TachoWorkState.rest,
        startedAt: { lt: shiftWindow.to },
        endedAt: { gt: shiftWindow.from },
      },
      select: { id: true, dddFileId: true, startedAt: true, endedAt: true },
    });

    const drafts = deriveBreakCandidates({
      restIntervals: restRows.map((row) => ({ from: row.startedAt, to: row.endedAt })),
      shiftWindow,
      recordedBreaks: folded.breakIntervals,
      minMinutes: await this.minMinutes(),
    });

    const existingRows = await this.prisma.breakCandidate.findMany({
      where: { workSessionId },
      select: { id: true, startedAt: true, endedAt: true, status: true },
    });
    const byStart = new Map(existingRows.map((row) => [row.startedAt.getTime(), row]));
    const derivedStarts = new Set(drafts.map((draft) => draft.startedAt.getTime()));

    for (const draft of drafts) {
      // Delil blogunu besleyen ham kayitlar — gerekce icin saklaniyor.
      const contributing = restRows.filter(
        (row) =>
          row.startedAt.getTime() < draft.evidence.endedAt.getTime() &&
          row.endedAt.getTime() > draft.evidence.startedAt.getTime(),
      );
      const provenance = {
        evidenceStartedAt: draft.evidence.startedAt,
        evidenceEndedAt: draft.evidence.endedAt,
        evidenceRestMinutes: draft.evidence.restMinutes,
        evidenceRecordedBreakMinutes: draft.evidence.recordedBreakMinutes,
        evidenceActivityIds: contributing.map((row) => row.id),
        evidenceDddFileIds: [
          ...new Set(contributing.map((row) => row.dddFileId).filter((id): id is string => !!id)),
        ],
        derivedAt: asOf,
      };

      const existing = byStart.get(draft.startedAt.getTime());
      if (!existing) {
        await this.prisma.breakCandidate.create({
          data: {
            tenantId: session.tenantId,
            driverId: session.driverId,
            workSessionId,
            startedAt: draft.startedAt,
            endedAt: draft.endedAt,
            durationMinutes: draft.durationMinutes,
            ...provenance,
          },
        });
        continue;
      }

      // KARARA BAGLANMIS aday dokunulmaz. Gec gelen daha eksiksiz DDD, verilmis
      // bir karari degistiremez; onaylanmis adayin araligi kaysaydi yazilan
      // olaylarla bagi kopardi.
      if (existing.status !== BreakCandidateStatus.pending) continue;

      // Bekleyen adayda gec gelen veri DAHA IYIDIR: 12:00–12:20 olarak baslayip
      // sonra 12:00–12:47 oldugu anlasilan dinlenme 20 dakikada donmamali.
      // Idempotency, daha kaliteli veriyi yok saymak demek degil.
      await this.prisma.breakCandidate.update({
        where: { id: existing.id },
        data: { endedAt: draft.endedAt, durationMinutes: draft.durationMinutes, ...provenance },
      });
    }

    // ARTIK TURETILEMEYEN bekleyen adaylar geri cekiliyor. Surucu o molayi elle
    // kaydettiginde, takograf verisi duzeltildiginde veya vardiya penceresi
    // degistiginde eski oneri gecerliligini yitiriyor; birakilirsa ekranda
    // sonsuza kadar duran, onaylandiginda YANLIS mola yazan bir satir olurdu.
    // Silmek guvenli: `pending` demek henuz kimsenin karar vermedigi demek.
    const stale = existingRows.filter(
      (row) =>
        row.status === BreakCandidateStatus.pending && !derivedStarts.has(row.startedAt.getTime()),
    );
    if (stale.length > 0) {
      await this.prisma.breakCandidate.deleteMany({
        where: { id: { in: stale.map((row) => row.id) } },
      });
    }

    return this.listForSession(workSessionId);
  }

  /**
   * Bir aralikta calisilmis vardiyalarin adaylarini tazeler.
   *
   * Ofis ekrani bunu cagirmak ZORUNDA: uretim vardiya bazinda kosuyor ve
   * yalnizca surucu uygulamayi acinca tetiklenseydi, hic acmayan surucunun
   * kacirilmis molasi ofiste de hic gorunmezdi — oysa bu ozelligin varlik
   * sebebi tam olarak o durum.
   */
  async syncRange(params: { driverId?: string; from: Date; to: Date }): Promise<void> {
    const sessions = await this.prisma.workSession.findMany({
      where: {
        startedAt: { gte: params.from, lt: params.to },
        ...(params.driverId ? { driverId: params.driverId } : {}),
      },
      select: { id: true },
      take: 500,
    });

    for (const session of sessions) {
      await this.syncSession(session.id);
    }
  }

  async listForSession(workSessionId: string): Promise<BreakCandidateView[]> {
    const rows = await this.prisma.breakCandidate.findMany({
      where: { workSessionId },
      orderBy: { startedAt: 'asc' },
    });
    return rows.map(toView);
  }

  /**
   * Ofis listesi. Varsayilan olarak yalnizca BEKLEYENLER: karara baglanmis
   * adaylar ekranin isini bitirmis sayilir, gecmis denetim icin ayrica
   * sorgulanabilir.
   */
  async listForOffice(params: {
    driverId?: string;
    dateFrom?: Date;
    dateTo?: Date;
    status?: BreakCandidateStatus;
  }): Promise<BreakCandidateView[]> {
    const rows = await this.prisma.breakCandidate.findMany({
      where: {
        status: params.status ?? BreakCandidateStatus.pending,
        ...(params.driverId ? { driverId: params.driverId } : {}),
        ...(params.dateFrom || params.dateTo
          ? {
              startedAt: {
                ...(params.dateFrom ? { gte: params.dateFrom } : {}),
                ...(params.dateTo ? { lt: params.dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: { startedAt: 'asc' },
      take: 200,
    });
    return rows.map(toView);
  }

  /**
   * Adayi mola olarak kabul eder.
   *
   * Olaylar `WorkTimeService` uzerinden ve TEK transaction'da yaziliyor; yarim
   * kalmis bir `break_start` vardiyayi "molada takilmis" gosterirdi. Olay
   * kimlikleri adaya geri yaziliyor: denetimde "bu mola nereden geldi"
   * sorusunun cevabi bu bag.
   */
  async confirm(
    candidateId: string,
    actor: { userId: string | null; source: WorkTimeEventSource },
    asOf: Date = new Date(),
  ): Promise<BreakCandidateView> {
    const candidate = await this.requireCandidate(candidateId);
    if (candidate.status !== BreakCandidateStatus.pending) {
      // Iki ekran ayni adayi ayni anda gorebiliyor; ikinci karar sessizce
      // gecerse ayni mola iki kez yazilirdi.
      throw new ConflictException({ code: 'break_candidate_already_decided' });
    }

    const events = await this.workTime.appendBreakInterval({
      workSessionId: candidate.workSessionId,
      driverId: candidate.driverId,
      startedAt: candidate.startedAt,
      endedAt: candidate.endedAt,
      source: actor.source,
    });

    const updated = await this.prisma.breakCandidate.update({
      where: { id: candidate.id },
      data: {
        status: BreakCandidateStatus.confirmed,
        decidedAt: asOf,
        decidedById: actor.userId,
        decisionSource: actor.source,
        breakStartEventId: events.breakStartEventId,
        breakEndEventId: events.breakEndEventId,
      },
    });

    return toView(updated);
  }

  /** "Bu mola degildi." Zeiterfassung DEGISMEZ; yalnizca soru kapanir. */
  async dismiss(
    candidateId: string,
    actor: { userId: string | null; source: WorkTimeEventSource },
    asOf: Date = new Date(),
  ): Promise<BreakCandidateView> {
    const candidate = await this.requireCandidate(candidateId);
    if (candidate.status !== BreakCandidateStatus.pending) {
      throw new ConflictException({ code: 'break_candidate_already_decided' });
    }

    const updated = await this.prisma.breakCandidate.update({
      where: { id: candidate.id },
      data: {
        status: BreakCandidateStatus.dismissed,
        decidedAt: asOf,
        decidedById: actor.userId,
        decisionSource: actor.source,
      },
    });

    return toView(updated);
  }

  private async requireCandidate(id: string) {
    const row = await this.prisma.breakCandidate.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException({ code: 'break_candidate_not_found' });
    }
    return row;
  }
}
