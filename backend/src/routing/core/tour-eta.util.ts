/**
 * Durak varis/kalkis saatlerinin hesabi.
 *
 * Saf tutuluyor cunku sahada en pahali hata burada olusur: yanlis ETA sonucu
 * musteri bekler, surucu gec kalir ve kimse hesabin nerede kaydigini goremez.
 * Zincirleme bir hesap — bir bacaktaki hata sonraki tum duraklara tasinir.
 */

export interface EtaStopInput {
  id: string;
  /** Durakta gecen sure (bosaltma, evrak). Plani cogu zaman bu belirler. */
  serviceMinutes: number;
  /**
   * Bir onceki duraktan bu duraga gelis suresi (dk). Ilk durakta null olmali;
   * ortadaki bir durakta null ise zincir kirilir ve o noktadan sonrasi
   * hesaplanamaz.
   */
  legDurationMin: number | null;
}

export interface EtaStopSchedule {
  id: string;
  plannedArrivalAt: Date | null;
  plannedDepartureAt: Date | null;
}

export interface TourSchedule {
  stops: EtaStopSchedule[];
  /** Son duraktaki isin bitisi. Turun bitis ani olarak kaydedilir. */
  endAt: Date | null;
}

function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * 60_000);
}

/**
 * Kalkis anindan itibaren her duragin varis ve kalkis saatini uretir.
 *
 * `startAt` yoksa tum alanlar null doner — uydurma bir baslangic saati
 * varsaymaktansa "saat bilinmiyor" demek dogru; arayuz bunu bos gosterir.
 *
 * Bacak suresi eksik olan duraktan itibaren zincir null'a duser ve bir daha
 * toparlanmaz: eksik bacagi sifir saymak tum sonraki saatleri erkene ceker,
 * bu da gec kalmaktan daha kotu bir yanlis bilgidir.
 */
export function computeTourSchedule(
  startAt: Date | null | undefined,
  stops: EtaStopInput[],
): TourSchedule {
  if (!startAt || stops.length === 0) {
    return {
      stops: stops.map((stop) => ({
        id: stop.id,
        plannedArrivalAt: null,
        plannedDepartureAt: null,
      })),
      endAt: null,
    };
  }

  const schedule: EtaStopSchedule[] = [];
  let cursor: Date | null = startAt;

  stops.forEach((stop, index) => {
    if (cursor === null) {
      schedule.push({ id: stop.id, plannedArrivalAt: null, plannedDepartureAt: null });
      return;
    }

    let arrival: Date;
    if (index === 0) {
      // Ilk durak kalkis noktasi: arac zaten oradadir, bacak suresi yoktur.
      arrival = cursor;
    } else if (stop.legDurationMin === null) {
      cursor = null;
      schedule.push({ id: stop.id, plannedArrivalAt: null, plannedDepartureAt: null });
      return;
    } else {
      arrival = addMinutes(cursor, stop.legDurationMin);
    }

    const departure = addMinutes(arrival, Math.max(0, stop.serviceMinutes));
    cursor = departure;
    schedule.push({ id: stop.id, plannedArrivalAt: arrival, plannedDepartureAt: departure });
  });

  const last = schedule[schedule.length - 1];
  return { stops: schedule, endAt: last?.plannedDepartureAt ?? null };
}
