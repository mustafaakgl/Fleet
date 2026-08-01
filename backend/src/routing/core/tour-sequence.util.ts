/**
 * Tur sirasi hesaplamalarinin saf kismi.
 *
 * Optimizasyonun kendisi Valhalla'da (ileride OR-Tools'ta) yapiliyor; burada
 * yalnizca cagri oncesi/sonrasi dogrulama ve donusturme var. Saf tutulmasinin
 * sebebi test edilebilirligi: sira hatalari sahada "surucu yanlis yere gitti"
 * olarak ortaya cikar ve geriye donuk teshisi zordur.
 */

export interface SequenceableStop {
  id: string;
  latitude: number | null;
  longitude: number | null;
  /** depot_start her zaman basta, depot_end her zaman sonda kalir */
  kind: 'depot_start' | 'pickup' | 'delivery' | 'depot_end';
  /** Ayni goreve ait alis, teslimden ONCE gelmek zorunda */
  assignmentId?: string | null;
}

export interface SequenceValidationIssue {
  code:
    | 'missing_coordinates'
    | 'too_few_stops'
    | 'multiple_depot_start'
    | 'multiple_depot_end'
    | 'too_many_stops';
  stopId?: string;
  message: string;
}

/**
 * Valhalla /optimized_route'un pratik ust siniri. Faz 1'de olculdu: 19 durak
 * calisiyor, 20'de "No path could be found" alindi — ama sebebi durak sayisi
 * degil, tek bir kamyona kapali koordinatti. Yine de matris maliyeti karesel
 * buyudugu icin (41x41 soguk 7,1 sn) makul bir tavan konuyor. Bu sinirin
 * uzerinde OR-Tools gerekir.
 */
export const MAX_SEQUENCEABLE_STOPS = 20;

/** Optimizasyona gonderilmeden once girdiyi dogrular. */
export function validateSequenceInput(stops: SequenceableStop[]): SequenceValidationIssue[] {
  const issues: SequenceValidationIssue[] = [];

  if (stops.length < 2) {
    issues.push({
      code: 'too_few_stops',
      message: 'Siralama icin en az iki durak gerekir',
    });
  }

  if (stops.length > MAX_SEQUENCEABLE_STOPS) {
    issues.push({
      code: 'too_many_stops',
      message: `Bu siralayici en fazla ${MAX_SEQUENCEABLE_STOPS} durak destekler`,
    });
  }

  for (const stop of stops) {
    if (stop.latitude === null || stop.longitude === null) {
      issues.push({
        code: 'missing_coordinates',
        stopId: stop.id,
        message: 'Duragin koordinati yok — adres cozumlenmemis olabilir',
      });
    }
  }

  if (stops.filter((s) => s.kind === 'depot_start').length > 1) {
    issues.push({ code: 'multiple_depot_start', message: 'Birden fazla baslangic depo duragi' });
  }
  if (stops.filter((s) => s.kind === 'depot_end').length > 1) {
    issues.push({ code: 'multiple_depot_end', message: 'Birden fazla bitis depo duragi' });
  }

  return issues;
}

/**
 * Depo duraklarini ayirir. Valhalla /optimized_route ilk ve son noktayi sabit
 * tutup aradakileri siralar; depo duraklarini bu uclara yerlestiriyoruz.
 */
export function splitDepotStops(stops: SequenceableStop[]): {
  start: SequenceableStop | null;
  middle: SequenceableStop[];
  end: SequenceableStop | null;
} {
  const start = stops.find((s) => s.kind === 'depot_start') ?? null;
  const end = stops.find((s) => s.kind === 'depot_end') ?? null;
  const middle = stops.filter((s) => s.kind !== 'depot_start' && s.kind !== 'depot_end');
  return { start, middle, end };
}

/**
 * Optimizasyon ciktisindaki siranin gecerli olup olmadigini kontrol eder.
 *
 * En kritik kural: ayni goreve ait ALIS, TESLIMDEN once gelmelidir. Valhalla
 * bunu bilmez — o sadece gezgin satici problemi cozer. Cikti bu kurali
 * ihlal ediyorsa sira reddedilir; yuku almadan teslim etmeye giden bir plan
 * uretmektense optimizasyonu atlamak dogrudur.
 */
export function violatesPickupBeforeDelivery(ordered: SequenceableStop[]): boolean {
  const pickupIndex = new Map<string, number>();

  ordered.forEach((stop, index) => {
    if (stop.kind === 'pickup' && stop.assignmentId) {
      // Ayni gorev icin birden fazla alis olursa ilki esas alinir
      if (!pickupIndex.has(stop.assignmentId)) {
        pickupIndex.set(stop.assignmentId, index);
      }
    }
  });

  return ordered.some((stop, index) => {
    if (stop.kind !== 'delivery' || !stop.assignmentId) {
      return false;
    }
    const pickupAt = pickupIndex.get(stop.assignmentId);
    // Alis duragi turda hic yoksa kisit uygulanamaz — ihlal sayilmaz
    if (pickupAt === undefined) {
      return false;
    }
    return pickupAt > index;
  });
}

/**
 * Valhalla'nin dondurdugu ziyaret sirasini gercek durak dizisine cevirir.
 * `order` degerleri middle dizisine ait indeksleridir.
 */
export function applyOptimizedOrder(
  middle: SequenceableStop[],
  order: number[],
): SequenceableStop[] | null {
  if (order.length !== middle.length) {
    return null;
  }
  const seen = new Set<number>();
  const result: SequenceableStop[] = [];

  for (const index of order) {
    if (!Number.isInteger(index) || index < 0 || index >= middle.length || seen.has(index)) {
      return null;
    }
    seen.add(index);
    result.push(middle[index]);
  }

  return result;
}

/** 1'den baslayan ardisik sira numaralari uretir. */
export function toSequenceNumbers(stops: SequenceableStop[]): Array<{ id: string; sequence: number }> {
  return stops.map((stop, index) => ({ id: stop.id, sequence: index + 1 }));
}
