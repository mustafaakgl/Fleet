import type { PayrollMovementType } from '@prisma/client';

/**
 * Bordronun saglayicidan BAGIMSIZ hareket dili.
 *
 * DATEV klasorunun ALTINDA DEGIL, bilerek: bu model DATEV'e ait olsaydi
 * yarin baska bir bordro sistemi eklendiginde hesap katmani da yeniden
 * yazilirdi. Adaptorler bunu okur; bu bunlardan hicbirini bilmez.
 */

/**
 * Normalize bordro hareketi — adaptorun okudugu TEK sey.
 *
 * DATEV adaptoru `PayrollEntry`'yi DOGRUDAN OKUMAZ. Araya bu model konmasinin
 * sebebi: kalem, Fleet'in hesap katmaninin ic yapisi (Soll/Ist/bakiye/kredi
 * gibi yalnizca bize ait alanlar tasiyor) ve disari cikan bicime baglanirsa
 * her bordro sistemi eklemesinde hesap katmani da degismek zorunda kalir.
 * Burada yalnizca "kim, ne kadar, hangi turden" var.
 */
export type NormalizedPayrollMovement = {
  driverId: string;
  personnelNumber: string;
  /** "YYYY-MM". Donem kimligi degil, insanin okudugu donem. */
  payrollPeriod: string;

  type: PayrollMovementType;
  /**
   * Miktar. Saat hareketlerinde DAKIKA tasiniyor, gun hareketlerinde gun,
   * para hareketlerinde cent. Yuvarlama yazicida yapiliyor: her hedef bicim
   * kendi ondalik kuralini uyguluyor ve burada yuvarlamak bilgi kaybi olurdu.
   */
  quantity: number;
  unit: PayrollMovementUnit;

  /**
   * Hedef sistemdeki karsilik (DATEV'de Lohnart numarasi). Model bunu
   * yorumlamaz, yalnizca tasir.
   */
  wageType?: string;

  /** Gun bazli hareketlerde ilgili tarih ("YYYY-MM-DD"). */
  date?: string;

  costCenter?: string;
  costUnit?: string;

  /** Hangi kalemden turedigi — dosyadan veriye geri yol. */
  sourceId: string;
};

export type PayrollMovementUnit = 'minutes' | 'days' | 'euro_cents';

/** Saat hareketleri; gun/para olanlardan ayri davraniyorlar. */
export const HOUR_MOVEMENTS: ReadonlySet<PayrollMovementType> = new Set([
  'regular_hours',
  'overtime_hours',
  'night_hours',
  'night_core_hours',
  'sunday_hours',
  'holiday_hours',
] as PayrollMovementType[]);

export function unitOf(type: PayrollMovementType): PayrollMovementUnit {
  if (HOUR_MOVEMENTS.has(type)) return 'minutes';
  if (type === 'allowance' || type === 'expense') return 'euro_cents';
  return 'days';
}
