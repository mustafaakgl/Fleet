import { canViewFinancialFields } from '../../common/utils/permissions';

/**
 * ALAN BAZLI FINANS KORUMASI — DISPATCH VE SLOT (Faz 17f) — SAF mantik.
 *
 * KORUMA SUNUCU YANITINDA, EKRANDA DEGIL. Ofis kullanicisi ayni ucu `curl`
 * ile cagirdiginda da tutari gorememeli; arayuzde gizlemek bu kisiyi hicbir
 * seyden alikoymaz.
 *
 * NEDEN AYRI BIR MASKELEYICI: Faz 15'in `maskOrderFinancials`i bir SIPARIS
 * govdesini, Faz 16'nin maskesi bir GELEN KUTUSU mesajini biliyor. Dispatch
 * yaniti ikisini de ICERIR (oneri -> siparisler -> kalemler) ve ustune UC
 * yeni sizinti yuzeyi ekler:
 *
 *   1. `DispatchCandidate.checks[].evidence` — sayilabilir kanit. Bir kontrol
 *      geliri karsilastirirsa tutar BURADAN sizar.
 *   2. `AutomationProposal.payload/evidence` — ajanin ciktisi. Sozlesme bugun
 *      kapali ve referans tabanli, ama surum artarsa alan eklenebilir; maske
 *      SEMAYA DEGIL ADA bakiyor ki yeni alan sessizce acilmasin.
 *   3. `reasonKey`, red gerekcesi ve karar notu gibi METINLER — tutari
 *      gostermeden VARLIGINI ele verirler ("gelir hedefin altinda").
 */

/** Yanit govdesinde yalnizca finansal rollerin gorebilecegi duz alanlar. */
export const DISPATCH_FINANCIAL_FIELDS = [
  'currency',
  'contractedRevenue',
  'billingMode',
  'revenueAllocation',
  'expectedDailyRevenue',
  'expectedRevenue',
  'totalRevenue',
] as const;

export function canSeeDispatchFinancials(role: string | null | undefined): boolean {
  return canViewFinancialFields(role ?? '');
}

/**
 * NEDEN FAZ 16'NIN `isFinancialField`I BURADA KULLANILMIYOR.
 *
 * O fonksiyon ALT DIZGE ariyor ve girdisi denetlenmis bir alan adi listesi
 * oldugu surece dogru calisiyor. Dispatch yaniti ise govdenin TAMAMINI
 * tariyor ve orada alt dizge esleşmesi YANLIS POZITIF uretiyor:
 *
 *     "operatedAt"  -> ope[rate]dAt
 *     "generatedAt" -> gene[rate]dAt
 *
 * Ikisi de `null` olurdu ve dispatcher zaman damgalarini kaybederdi — maske
 * calisiyor gorunurken veriyi bozan, fark edilmesi en zor turden bir hata.
 * Bu yuzden burada KELIME SINIRI var: ad `camelCase`/`snake_case` sinirlarindan
 * bolunuyor ve kisa jetonlar (`cost`, `rate`, `fee`) yalnizca TAM KELIME
 * olarak eslesiyor.
 */
const WHOLE_WORD_TOKENS = new Set([
  'cost', 'costs', 'rate', 'rates', 'fee', 'fees', 'tax', 'vat',
  'eur', 'usd', 'chf',
]);

/**
 * BURADA OLMAYANLAR DA BILINCLI: `total`, `sum`, `net`, `gross`.
 *
 * Bunlar NICELIK BELIRTECI, finansal jeton degil. Listeye alsaydik
 * `totalDistanceKm`, `totalDurationMin`, `netWeightKg` ve `grossWeightKg`
 * maskelenirdi — mesafe, sure ve agirlik finansal veri DEGIL ve dispatcher
 * plani onlarsiz okuyamaz. Gercek finansal adlar zaten ikinci jetonlarindan
 * yakalaniyor: `totalPrice` -> `price`, `netAmount` -> `amount`,
 * `gesamtbetrag` -> `betrag`.
 */

/**
 * Ayirt edici jetonlar: bir kelimenin ICINDE gecmesi yeterli.
 *
 * Almanca birlesik adlar (`frachtpreis`, `gesamtbetrag`) tek kelimedir; tam
 * eslesme sartina baglasaydik bu adlar maskesiz kalirdi.
 */
const SUBSTRING_TOKENS = [
  'revenue', 'amount', 'price', 'pricing', 'currency', 'billing', 'invoice',
  'payment', 'salary', 'payroll', 'margin', 'surcharge', 'tariff',
  'tarif', 'fracht', 'preis', 'betrag', 'entgelt', 'kosten', 'rechnung',
  'tutar', 'fiyat', 'navlun', 'ucret',
  // Gecis ucreti de bir MALIYETTIR. `Tour.plannedTollCents` bu listede
  // olmasaydi tur sonucu ofise maskesiz donerdi — ve bu, yalnizca birisi
  // ekranda rakami gordugunde fark edilirdi.
  'toll', 'maut', 'cents',
];

/** Adi/metni kelimelerine bolerek finansal olup olmadigina bakar. */
export function isFinancialName(value: string): boolean {
  const words = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/u)
    .filter(Boolean);

  return words.some(
    (word) =>
      WHOLE_WORD_TOKENS.has(word) || SUBSTRING_TOKENS.some((token) => word.includes(token)),
  );
}

/**
 * METIN FINANSI ELE VERIYOR MU.
 *
 * PARA DESENI DE ARANIYOR: "1.250,00 EUR" hicbir finansal AD icermez ama
 * tutarin kendisidir.
 */
const MONEY_PATTERN =
  /(\d[\d., \s]*\s*(?:eur|euro|usd|chf|gbp|€|\$|£))|((?:eur|euro|usd|chf|gbp|€|\$|£)\s*\d)/i;

export function textRevealsFinancials(value: string): boolean {
  return MONEY_PATTERN.test(value) || isFinancialName(value);
}

/**
 * DEGERLERDE YALNIZCA PARA DESENI ARANIYOR — AD ESLESTIRMESI DEGIL.
 *
 * `textRevealsFinancials` bir SERBEST METIN icin dogru olcu: "Marge zu
 * gering" tutar tasimaz ama konuyu ele verir. Ama ayni olcuyu govdedeki HER
 * dizgeye uygularsak KIMLIKLERI yok ederiz:
 *
 *     checkCode: "order_margin"   -> `margin` yuzunden null
 *     companyName: "Preiss GmbH"  -> `preis` yuzunden null
 *
 * Ilki dispatcher'in hangi kontrolu astigini gormesini, ikincisi musteriyi
 * tanimasini engellerdi — ikisi de tutar DEGIL. Bu yuzden derin tarama
 * degerlerde yalnizca GERCEK BIR TUTARI ariyor; konuyu ele veren serbest
 * metinler `maskFreeText` ile ALAN BAZINDA ve bilincli olarak temizleniyor.
 */
function valueIsMoney(value: string): boolean {
  return MONEY_PATTERN.test(value);
}

/**
 * Kanit sozlugunu maskeler.
 *
 * ANAHTAR KALIYOR, DEGER GIDIYOR: incelemeci "bu kontrolun kaniti var ama
 * goremiyorum" diyebilmeli. Anahtari da silseydik "kontrol kanitsiz yapildi"
 * sanirdi — maskelemeden daha kotu bir yanlis bilgi.
 */
export function maskEvidenceRecord(
  evidence: Record<string, string | number | boolean | null> | undefined,
  role: string | null | undefined,
): Record<string, string | number | boolean | null> | undefined {
  if (!evidence) return undefined;
  if (canSeeDispatchFinancials(role)) return evidence;

  const masked: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(evidence)) {
    const leaks = isFinancialName(key) || (typeof value === 'string' && valueIsMoney(value));
    masked[key] = leaks ? null : value;
  }
  return masked;
}

/** Ceviri anahtari finansi ele veriyorsa notr bir anahtarla degistirilir. */
export const MASKED_REASON_KEY = 'masked_financial';

export function maskReasonKey(reasonKey: string, role: string | null | undefined): string {
  if (canSeeDispatchFinancials(role)) return reasonKey;
  return isFinancialName(reasonKey) ? MASKED_REASON_KEY : reasonKey;
}

/** Serbest metin (red gerekcesi, karar notu) finansi ele veriyorsa dusurulur. */
export function maskFreeText(
  value: string | null | undefined,
  role: string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  if (canSeeDispatchFinancials(role)) return value;
  return textRevealsFinancials(value) ? null : value;
}

/**
 * DERIN MASKE — govdenin tamaminda ad bazli tarama.
 *
 * ACIK PROJEKSIYONUN YERINE GECMEZ, USTUNE BINER. Projeksiyon "hangi alanlar
 * disari cikar" sorusunu cevapliyor; bu fonksiyon o projeksiyonun ic ice
 * yapilarinda gozden kacan bir finansal adi yakaliyor. Iki katman da gerekli:
 * biri unutuldugunda digeri tutuyor.
 *
 * ALAN SILINMIYOR, `null` YAZILIYOR — alanin YOKLUGU ile GORULEMEZ OLMASI
 * arayuzde ayni sey degil (Faz 15/16 ile ayni gerekce).
 */
export function maskDispatchFinancials<T>(payload: T, role: string | null | undefined): T {
  if (canSeeDispatchFinancials(role)) return payload;
  return deepMask(payload) as T;
}

function deepMask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => deepMask(item));
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;

  const masked: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isFinancialName(key)) {
      masked[key] = null;
      continue;
    }
    if (typeof entry === 'string' && valueIsMoney(entry)) {
      masked[key] = null;
      continue;
    }
    masked[key] = deepMask(entry);
  }
  return masked;
}

/**
 * Denetim metadata'si.
 *
 * Denetim kayitlari GENIS OKUNUR. Korunan bir tutarin oraya duz metin olarak
 * dusmesi butun maskelemeyi baska bir kapidan atlatirdi. Bu yuzden dispatch
 * ve slot denetim kayitlarina tutar HIC YAZILMIYOR; burasi o kurali YAZMA
 * aninda uygulayan son kapi.
 *
 * ALAN NULL'LANMIYOR, TAMAMEN DUSURULUYOR: denetim kaydi bir arayuz degil,
 * kalici bir iz. "Burada bir tutar vardi" bilgisinin bile orada kalmasina
 * gerek yok.
 */
export function auditSafeMetadata<T extends Record<string, unknown>>(metadata: T): T {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (isFinancialName(key)) continue;
    if (typeof value === 'string' && valueIsMoney(value)) continue;
    safe[key] = value;
  }
  // Donen tip GIRDIYLE AYNI: cagiran taraf Prisma'nin JSON tipini kaybetmesin.
  // Dusen alanlar zaten istege bagli olanlar; zorunlu bir alan bu listeye
  // girseydi cagiran yerde derleme hatasi vermesi DOGRU olurdu.
  return safe as T;
}

/**
 * TOKEN VE OZET DENETIME GIRMEZ.
 *
 * Slot davetinin duz metin token'i ya da SHA-256 ozeti bir denetim kaydina
 * duserse, veritabanini okuyan biri linki KULLANABILIR hale gelir — token'i
 * ozetleyerek saklamanin butun anlami kaybolur.
 */
const SECRET_NAME_TOKENS = ['token', 'hash', 'secret', 'password', 'credential', 'apikey', 'storagepath'];

export function containsSecretName(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SECRET_NAME_TOKENS.some((token) => normalized.includes(token));
}

/** Denetim metadata'sindan hem finansi hem sirlari duser. */
export function auditSafeSlotMetadata<T extends Record<string, unknown>>(metadata: T): T {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(auditSafeMetadata(metadata))) {
    if (containsSecretName(key)) continue;
    safe[key] = value;
  }
  return safe as T;
}
