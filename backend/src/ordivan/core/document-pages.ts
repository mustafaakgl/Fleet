/**
 * SAYFA ARALIKLARI (Faz 14) — SAF mantik.
 *
 * TEK FIZIKSEL YUKLEME, COK MANTIKSAL BELGE. Bir tarayicidan gelen 8 sayfalik
 * PDF, ic ice gecmis uc ayri belge olabilir: bir servis faturasi, bir TUV
 * raporu ve bir yakit fisi. Bunlari AYRI DOSYALARA BOLMEK yanlis olurdu:
 *   - orijinalin hash'i ve butunlugu kaybolur,
 *   - ayni icerik diskte cogalir,
 *   - yeniden siniflandirma her seferinde yeni bir kopya uretir.
 *
 * Bu yuzden mantiksal belge = AYNI blob + SAYFA ARALIGI. Bolme, birlestirme ve
 * yeniden siniflandirma yalnizca bu arayuzu degistirir; DOSYAYA DOKUNMAZ.
 */

export interface PageRange {
  /** 1 tabanli, dahil. */
  pageFrom: number;
  /** 1 tabanli, dahil. */
  pageTo: number;
}

export type PageRangeErrorCode =
  | 'page_range_empty'
  | 'page_range_not_integer'
  | 'page_range_reversed'
  | 'page_range_out_of_bounds'
  | 'page_range_overlap';

export class PageRangeError extends Error {
  constructor(readonly code: PageRangeErrorCode, readonly detail?: Record<string, unknown>) {
    super(code);
    this.name = 'PageRangeError';
  }
}

function assertSingleRange(range: PageRange, pageCount: number): void {
  if (!Number.isInteger(range.pageFrom) || !Number.isInteger(range.pageTo)) {
    throw new PageRangeError('page_range_not_integer', { ...range });
  }
  if (range.pageFrom > range.pageTo) {
    throw new PageRangeError('page_range_reversed', { ...range });
  }
  // Sinirlar BELGENIN KENDISINDEN: istemcinin bildirdigi sayfa sayisi degil,
  // sunucunun dosyadan saydigi sayi gecerli.
  if (range.pageFrom < 1 || range.pageTo > pageCount) {
    throw new PageRangeError('page_range_out_of_bounds', { ...range, pageCount });
  }
}

/**
 * Kullanicinin gonderdigi bolumlemeyi dogrular.
 *
 * NEDEN ORTUSME YASAK: ayni sayfa iki mantiksal belgeye ait olsaydi, ayni
 * faturanin hem servis kaydi hem yakit gideri olarak iki kez kaydedilmesinin
 * onunde hicbir sey kalmazdi.
 *
 * NEDEN BOSLUK SERBEST: taranmis yiginlarda bos ayirici sayfa, kapak ya da
 * arka yuz olur. Kullaniciyi her sayfayi bir belgeye atamaya zorlamak, onu
 * rastgele bir belgeye eklemeye iter — bosluga izin vermek daha durustur.
 */
export function validatePageRanges(ranges: PageRange[], pageCount: number): PageRange[] {
  if (ranges.length === 0) {
    throw new PageRangeError('page_range_empty');
  }
  for (const range of ranges) {
    assertSingleRange(range, pageCount);
  }

  const sorted = [...ranges].sort((left, right) => left.pageFrom - right.pageFrom);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (current.pageFrom <= previous.pageTo) {
      throw new PageRangeError('page_range_overlap', {
        first: { ...previous },
        second: { ...current },
      });
    }
  }
  return sorted;
}

/**
 * AJANIN onerdigi sayfa sinirlarini GUVENLI hale getirir.
 *
 * Ajan yanlis sinir onerebilir — eval setinde bunun icin ayri vakalar var.
 * Onerinin kendisi REDDEDILMIYOR (insan zaten duzeltecek) ama sinirlarin
 * disina TASAMIYOR: 12. sayfayi isaret eden bir oneri, 3 sayfalik bir belgede
 * sessizce kabul edilirse arayuz bos bir onizleme gosterir ve kullanici neyi
 * onayladigini goremez.
 *
 * Kurtarilamayan oneri `null` doner: cagiran taraf o zaman TUM BELGEYI tek
 * mantiksal belge sayar ve durumu `needs_review` birakir.
 */
export function clampProposedRange(
  proposed: { pageFrom?: unknown; pageTo?: unknown },
  pageCount: number,
): PageRange | null {
  const from = Number(proposed.pageFrom);
  const to = Number(proposed.pageTo);
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return null;
  }
  if (from > to) {
    return null;
  }
  const clampedFrom = Math.min(Math.max(from, 1), pageCount);
  const clampedTo = Math.min(Math.max(to, 1), pageCount);
  if (clampedFrom > clampedTo) {
    return null;
  }
  return { pageFrom: clampedFrom, pageTo: clampedTo };
}

/**
 * Ajanin bolumlemesini butun belgeye oturtur.
 *
 * ORTUSMEYI SESSIZCE DUZELTMIYORUZ: ortusen bir oneri, ajanin sayfa sinirlarini
 * bulamadiginin isaretidir. Boyle bir durumda tek bir mantiksal belge doner ve
 * karar insana kalir — otomatik "duzeltme", yanlis bolunmus bir belgeyi dogru
 * gibi gosterirdi.
 */
export function resolveProposedSegmentation(
  proposals: Array<{ pageFrom?: unknown; pageTo?: unknown }>,
  pageCount: number,
): { ranges: PageRange[]; trusted: boolean } {
  const wholeDocument = { ranges: [{ pageFrom: 1, pageTo: pageCount }], trusted: false };

  if (proposals.length === 0) {
    return wholeDocument;
  }

  const clamped: PageRange[] = [];
  for (const proposal of proposals) {
    const range = clampProposedRange(proposal, pageCount);
    if (!range) {
      return wholeDocument;
    }
    clamped.push(range);
  }

  try {
    return { ranges: validatePageRanges(clamped, pageCount), trusted: true };
  } catch (error) {
    if (error instanceof PageRangeError) {
      return wholeDocument;
    }
    throw error;
  }
}

/** `1-3` gibi okunabilir bir etiket; tek sayfada yalnizca `4`. */
export function formatPageRange(range: PageRange): string {
  return range.pageFrom === range.pageTo
    ? String(range.pageFrom)
    : `${range.pageFrom}-${range.pageTo}`;
}

export function pageCountOf(range: PageRange): number {
  return range.pageTo - range.pageFrom + 1;
}
