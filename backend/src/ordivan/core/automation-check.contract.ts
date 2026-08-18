/**
 * EVRENSEL UC DURUMLU KONTROL SOZLESMESI (Faz 12).
 *
 * Butun gelecekteki ajanlar bu sozlesmeyi kullanir. Tek bir kural her seyi
 * belirliyor:
 *
 *   `unknown` HICBIR KOSULDA `verified` ya da "sorun yok" DEMEK DEGILDIR.
 *
 * Neden bu kadar keskin: bir kontrol calistirilamadiginda (servis kapali,
 * veri eski, alan bos) yaziliminin verebilecegi en tehlikeli cevap sessiz
 * kalmaktir. Sessizlik, ekranda "kontrol edildi" gibi okunur. Bu yuzden
 * "calistiramadim" ayri bir DURUM, ayrica NEDENI ve VERININ ZAMANI ile
 * birlikte tasiniyor.
 */

export type AutomationCheckStatus = 'verified' | 'failed' | 'unknown';

export interface AutomationCheckResult {
  /** Ceviri anahtari — sunucu kullanici diline metin uretmez. */
  code: string;
  status: AutomationCheckStatus;
  /**
   * Kullanici diline cevrilecek aciklamanin anahtari ve parametreleri.
   * Ham saglayici mesaji BURAYA GIRMEZ.
   */
  messageKey: string;
  messageParams?: Record<string, string | number>;
  /** Kanit: neyin nereden okundugu. Ham belge metni kopyalanmaz. */
  evidence?: Record<string, string | number | boolean | null>;
  /**
   * Kontrolun dayandigi VERININ zamani — kontrolun calistigi an degil.
   * "Dun geceki veriyle dogrulandi" ile "su an dogrulandi" ayni sey degil.
   */
  dataAt?: string;
  /**
   * `unknown` ise NEDEN dogrulanamadi. `unknown` icin ZORUNLU:
   * gerekcesiz bir "bilinmiyor", "bakmadim"dan ayirt edilemez.
   */
  unknownReason?: string;
}

/** Bir kontrolun gecmis SAYILMASI icin tek kabul edilen durum. */
export function isVerified(check: AutomationCheckResult): boolean {
  return check.status === 'verified';
}

/**
 * `unknown` bir kontrol asla gecmis sayilmaz.
 *
 * Bu fonksiyon bilincli olarak `isVerified`in degili DEGIL: "gecmedi" ile
 * "basarisiz" farkli seyler ve cagiran taraf ikisini karistirmasin diye ayri
 * ayri sorulabiliyor.
 */
export function isBlocking(check: AutomationCheckResult): boolean {
  return check.status === 'failed';
}

export function isUnknown(check: AutomationCheckResult): boolean {
  return check.status === 'unknown';
}

export interface CheckSummary {
  total: number;
  verified: number;
  failed: number;
  unknown: number;
  /**
   * BUTUN kontroller `verified` mi. Tek bir `unknown` bile bunu false yapar —
   * sozlesmenin en onemli satiri budur.
   */
  allVerified: boolean;
  /** En az bir kontrol calistirilamadi. */
  hasUnknown: boolean;
}

export function summarizeChecks(checks: AutomationCheckResult[]): CheckSummary {
  const verified = checks.filter((check) => check.status === 'verified').length;
  const failed = checks.filter((check) => check.status === 'failed').length;
  const unknown = checks.filter((check) => check.status === 'unknown').length;

  return {
    total: checks.length,
    verified,
    failed,
    unknown,
    // Bos liste de `allVerified` DEGILDIR: hicbir kontrol calismadiysa
    // "hepsi gecti" demek, en bastaki hatanin ta kendisi olurdu.
    allVerified: checks.length > 0 && verified === checks.length,
    hasUnknown: unknown > 0,
  };
}

/**
 * Bir kontrol sonucunu sozlesmeye gore dogrular.
 *
 * `unknown` icin gerekce ZORUNLU. Gerekce vermeden "bilinmiyor" demek,
 * kontrolun hic yazilmamis olmasindan daha kotudur: ekranda bir satir
 * gorunur ama neden orada oldugu bilinmez.
 */
export function assertValidCheck(check: AutomationCheckResult): void {
  if (check.status === 'unknown' && !check.unknownReason?.trim()) {
    throw new Error(`automation check "${check.code}" is unknown without a reason`);
  }
}

/** Kaydedilmeden once butun kontrollerin sozlesmeye uydugunu dogrular. */
export function assertValidChecks(checks: AutomationCheckResult[]): void {
  for (const check of checks) {
    assertValidCheck(check);
  }
}
