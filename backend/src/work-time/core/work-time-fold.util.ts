/**
 * Zeiterfassung'un hesap cekirdegi: olay dizisi → gunun ozeti.
 *
 * Saf fonksiyon, veritabani bilmiyor, saat okumuyor (`asOf` disaridan gelir).
 * Sebebi: toplam sure HICBIR YERDE saklanmiyor — vardiya her sorgulandiginda
 * olaylardan yeniden hesaplaniyor. Hesap saklanan bir alana yazilsaydi, gec
 * gelen bir cevrimdisi olay o alani sessizce yanlis birakirdi.
 *
 * Olaylar sirasiz gelebilir: surucunun telefonu cevrimdisiyken yakalanan
 * olaylar baglanti gelince toplu gonderiliyor. Bu yuzden katlama her zaman
 * `occurredAt`'e gore siralar, gelis sirasina degil.
 */

export type WorkTimeEventKind = 'clock_in' | 'break_start' | 'break_end' | 'clock_out';

export type FoldableWorkTimeEvent = {
  type: WorkTimeEventKind;
  occurredAt: Date;
  /** Kaydin kimligi. Ustu cizilme bagi bunun uzerinden kuruluyor. */
  id?: string;
  /**
   * Bu olayin gecersiz kildigi onceki olayin kimligi. Ofis duzeltmesi boyle
   * isliyor: eski satir yerinde kalir, katlamada atlanir.
   */
  supersedesEventId?: string | null;
  /**
   * Ayni `occurredAt`'i tasiyan olaylar icin ayirici; yazilma sirasi
   * (createdAt) verilir. Bir dizide ya HEPSINE verilir ya hicbirine — verilmeyen
   * olay dizideki konumuna duser ve iki olcek karisirsa siralama bozulur.
   */
  sequence?: number;
};

export type WorkTimeState = 'off' | 'working' | 'on_break';

export type WorkTimeAnomaly =
  /** Olay var ama hicbiri giris degil — vardiya nereden basladi belli degil. */
  | 'missing_clock_in'
  /** Vardiya hala acik: cikis olayi hic gelmemis. */
  | 'missing_clock_out'
  /** 12 saati gecen acik vardiya; mevcut stale_open esigiyle ayni. */
  | 'open_shift_too_long'
  /** Mola bitmeden cikis yapilmis; mola cikista kapatildi. */
  | 'missing_break_end'
  /** ArbZG §4'un istedigi molanin altinda kalinmis. */
  | 'break_shorter_than_required';

/**
 * Fiilen calisilan araliklar (mola disi). Bordro gece/Pazar/tatil ayrimini
 * TOPLAM DAKIKADAN yapamaz — hangi dakikanin ne zamana denk geldigini bilmesi
 * gerekir, bu yuzden araliklar disa aciliyor.
 */
export type WorkInterval = { from: Date; to: Date };

export type WorkTimeFoldResult = {
  state: WorkTimeState;
  startedAt: Date | null;
  endedAt: Date | null;
  /** Vardiya acikken son aralik `asOf`'ta kapatilir. */
  workIntervals: WorkInterval[];
  /** Mola araliklari. Gun satirindaki mola suresi de dogru gune dussun diye. */
  breakIntervals: WorkInterval[];
  /** Girisden cikisa (vardiya acikken `asOf`'a) kadar gecen brut sure. */
  grossMinutes: number;
  breakMinutes: number;
  /** Brut eksi mola. Bordronun esas aldigi deger. */
  netMinutes: number;
  /** ArbZG §4: 6 saati asan iste 30 dk, 9 saati asanda 45 dk. */
  requiredBreakMinutes: number;
  anomalies: WorkTimeAnomaly[];
  /** Gecerli olmayan gecise denk geldigi icin hesaba katilmayan olay sayisi. */
  ignoredCount: number;
};

/** Bir olayin katlamaya uygulanip uygulanmadigi — append kontrolu bunu kullanir. */
export type WorkTimeFoldTrace = WorkTimeFoldResult & {
  /** Girdi dizisiyle ayni sirada: o olay hesaba katildi mi. */
  applied: boolean[];
};

const OPEN_SHIFT_LIMIT_MINUTES = 12 * 60;

function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

/** ArbZG §4. Esik "asan" calisma suresi: tam 6 saatte mola zorunlu degil. */
export function requiredBreakMinutes(netWorkedMinutes: number): number {
  if (netWorkedMinutes > 9 * 60) return 45;
  if (netWorkedMinutes > 6 * 60) return 30;
  return 0;
}

function sortEvents(events: FoldableWorkTimeEvent[]): number[] {
  return events
    .map((_event, index) => index)
    .sort((left, right) => {
      const byTime =
        events[left].occurredAt.getTime() - events[right].occurredAt.getTime();
      if (byTime !== 0) return byTime;
      return (events[left].sequence ?? left) - (events[right].sequence ?? right);
    });
}

/**
 * Olaylari katlar ve hangilerinin uygulandigini da bildirir.
 *
 * Gecersiz gecisler (calisirken ikinci giris, mola disinda mola bitisi) sessizce
 * ATLANIR, hata firlatmaz: burasi okuma yolu ve elde ne varsa gosterebilmesi
 * gerekiyor. Yazma yolunda ayni karar `canAppendWorkTimeEvent` ile onceden
 * verilir, yani bozuk olay zaten tabloya girmez.
 */
export function traceWorkTimeEvents(
  events: FoldableWorkTimeEvent[],
  asOf: Date,
): WorkTimeFoldTrace {
  const order = sortEvents(events);
  const applied = new Array<boolean>(events.length).fill(false);
  // Ustu cizilenler hic olmamis sayilir. Zincir kurulabilir (duzeltmenin
  // duzeltmesi): her halka bir oncekini gecersiz kildigi icin ayrica takip
  // gerekmiyor, sadece isaret edilen kimlikleri toplamak yeterli.
  const superseded = new Set(
    events.map((event) => event.supersedesEventId).filter((id): id is string => Boolean(id)),
  );

  let state: WorkTimeState = 'off';
  let startedAt: Date | null = null;
  let endedAt: Date | null = null;
  let breakStartedAt: Date | null = null;
  let breakMinutes = 0;
  let sawClockIn = false;
  let missingBreakEnd = false;
  /** Acik calisma araliginin baslangici; mola basladiginda kapanir. */
  let workStartedAt: Date | null = null;
  const workIntervals: WorkInterval[] = [];
  const breakIntervals: WorkInterval[] = [];

  let supersededCount = 0;
  for (const index of order) {
    const event = events[index];
    if (event.id && superseded.has(event.id)) {
      supersededCount += 1;
      continue;
    }
    switch (event.type) {
      case 'clock_in':
        if (state !== 'off') break;
        state = 'working';
        // Ilk giris vardiyanin baslangicidir; ayni gun tekrar giris yapilirsa
        // (ara verip donmek) baslangic geriye sabit kalir.
        startedAt = startedAt ?? event.occurredAt;
        endedAt = null;
        sawClockIn = true;
        workStartedAt = event.occurredAt;
        applied[index] = true;
        break;

      case 'break_start':
        if (state !== 'working') break;
        state = 'on_break';
        breakStartedAt = event.occurredAt;
        if (workStartedAt) {
          workIntervals.push({ from: workStartedAt, to: event.occurredAt });
          workStartedAt = null;
        }
        applied[index] = true;
        break;

      case 'break_end':
        if (state !== 'on_break' || !breakStartedAt) break;
        breakMinutes += minutesBetween(breakStartedAt, event.occurredAt);
        breakIntervals.push({ from: breakStartedAt, to: event.occurredAt });
        breakStartedAt = null;
        state = 'working';
        workStartedAt = event.occurredAt;
        applied[index] = true;
        break;

      case 'clock_out':
        if (state === 'off') break;
        // Molayi kapatmadan cikis: surucu "Arbeit fortsetzen"e basmadan gunu
        // bitirmis. Mola cikis aninda kapatilir, kayip mola sonu isaretlenir.
        if (state === 'on_break' && breakStartedAt) {
          breakMinutes += minutesBetween(breakStartedAt, event.occurredAt);
          breakIntervals.push({ from: breakStartedAt, to: event.occurredAt });
          breakStartedAt = null;
          missingBreakEnd = true;
        }
        // Molada cikildiysa calisma araligi zaten mola baslangicinda kapandi.
        if (workStartedAt) {
          workIntervals.push({ from: workStartedAt, to: event.occurredAt });
          workStartedAt = null;
        }
        state = 'off';
        endedAt = event.occurredAt;
        applied[index] = true;
        break;
    }
  }

  // Vardiya hala calisir durumdaysa acik aralik su ana kadar sayilir.
  if (state === 'working' && workStartedAt && workStartedAt < asOf) {
    workIntervals.push({ from: workStartedAt, to: asOf });
  }

  // Devam eden mola da su ana kadar sayilir, yoksa ekranda mola suresi molanin
  // ortasinda donmus gorunur.
  const runningBreakMinutes =
    state === 'on_break' && breakStartedAt ? minutesBetween(breakStartedAt, asOf) : 0;
  if (state === 'on_break' && breakStartedAt && breakStartedAt < asOf) {
    breakIntervals.push({ from: breakStartedAt, to: asOf });
  }
  const totalBreakMinutes = breakMinutes + runningBreakMinutes;

  const grossMinutes = startedAt ? minutesBetween(startedAt, endedAt ?? asOf) : 0;
  const netMinutes = Math.max(0, grossMinutes - totalBreakMinutes);
  const required = requiredBreakMinutes(netMinutes);

  const anomalies: WorkTimeAnomaly[] = [];
  if (events.length > 0 && !sawClockIn) anomalies.push('missing_clock_in');
  if (state !== 'off') {
    anomalies.push('missing_clock_out');
    if (grossMinutes > OPEN_SHIFT_LIMIT_MINUTES) anomalies.push('open_shift_too_long');
  }
  if (missingBreakEnd) anomalies.push('missing_break_end');
  if (required > 0 && totalBreakMinutes < required) {
    anomalies.push('break_shorter_than_required');
  }

  return {
    state,
    startedAt,
    endedAt,
    workIntervals,
    breakIntervals,
    grossMinutes,
    breakMinutes: totalBreakMinutes,
    netMinutes,
    requiredBreakMinutes: required,
    anomalies,
    // Ustu cizilenler "yok sayilan" degil: bilerek gecersiz kilindilar.
    ignoredCount: applied.filter((value) => !value).length - supersededCount,
    applied,
  };
}

export function foldWorkTimeEvents(
  events: FoldableWorkTimeEvent[],
  asOf: Date,
): WorkTimeFoldResult {
  const { applied: _applied, ...result } = traceWorkTimeEvents(events, asOf);
  return result;
}

export type WorkTimeRejectReason =
  | 'already_working'
  | 'not_working'
  | 'not_on_break'
  | 'shift_not_started';

const REJECT_REASON: Record<WorkTimeEventKind, WorkTimeRejectReason> = {
  clock_in: 'already_working',
  break_start: 'not_working',
  break_end: 'not_on_break',
  clock_out: 'shift_not_started',
};

/**
 * Yeni olay yazilabilir mi?
 *
 * Karar mevcut duruma degil, olayin KENDI ANINDAKI duruma gore veriliyor:
 * aday olay diziye tarihine gore yerlestirilip katlama tekrar kosuluyor. Gec
 * gelen bir cevrimdisi olay boylece dogru yere oturuyor — "son durum kazanir"
 * mantigi 10:14'te yakalanmis bir mola baslangicini 13:00'te reddederdi.
 */
export function canAppendWorkTimeEvent(
  existing: FoldableWorkTimeEvent[],
  candidate: FoldableWorkTimeEvent,
): { apply: true } | { apply: false; reason: WorkTimeRejectReason } {
  const candidateIndex = existing.length;
  // Aday en son yazilandir: ayni ani tasiyan mevcut bir olayla esitlikte ondan
  // sonra gelmeli. Kendi `sequence`'i yoksa olcegi kaymasin diye en buyuk deger.
  const ordered: FoldableWorkTimeEvent = {
    ...candidate,
    sequence: candidate.sequence ?? Number.MAX_SAFE_INTEGER,
  };
  const trace = traceWorkTimeEvents([...existing, ordered], candidate.occurredAt);
  if (trace.applied[candidateIndex]) return { apply: true };
  return { apply: false, reason: REJECT_REASON[candidate.type] };
}
