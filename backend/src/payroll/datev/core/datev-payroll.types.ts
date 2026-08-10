import type { DatevPayrollSystem } from '@prisma/client';
import type { NormalizedPayrollMovement } from '../../core/payroll-movement';

/**
 * DATEV Lohn hattina ozgu tipler.
 *
 * BU KLASOR `src/invoicing/datev` ILE HICBIR SEY PAYLASMAZ. Orasi DATEV
 * Rechnungswesen (EXTF Buchungsstapel), burasi DATEV Lohn. Iki farkli DATEV
 * urunu, iki farkli muhatap, iki farkli dosya duzeni; ortak bir "DATEV"
 * soyutlamasi altinda birlestirilirse yanlis dosya yanlis muhasebeye gider.
 */

/** Hedef sisteme yazilirken gereken, hareketin disindaki baglam. */
export type DatevPayrollContext = {
  payrollSystem: DatevPayrollSystem;
  consultantNumber: string;
  clientNumber: string;
  year: number;
  month: number;
  /** Dosyanin uretildigi an; bicimlerin ust bilgisinde yer aliyor. */
  generatedAt: Date;
};

/**
 * Bir bicim yazicisinin sozlesmesi.
 *
 * Notr CSV de, LODAS da, Lohn und Gehalt da bunu uyguluyor; boylece ihracat
 * servisi hangi dosyayi urettigini bilmeden calisiyor.
 */
export interface PayrollFileWriter {
  readonly id: string;
  /** Dosya adi uzantisi dahil. */
  fileName(context: DatevPayrollContext): string;
  render(movements: readonly NormalizedPayrollMovement[], context: DatevPayrollContext): string;
}
