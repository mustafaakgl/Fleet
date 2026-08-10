import type { PayrollTargetSystem } from '@prisma/client';
import type { NormalizedPayrollMovement } from './payroll-movement';

/**
 * Dosya yazicilarinin ortak sozlesmesi.
 *
 * Saglayici klasorlerinin ALTINDA DEGIL, bilerek: sozlesme DATEV'e ait olsaydi
 * Lexware adaptoru ya onu import etmek zorunda kalirdi (yanlis bagimlilik
 * yonu) ya da kendi kopyasini tasirdi (iki ayri yazici arayuzu). Ikisi de
 * yanlis. Adaptorler `payroll/lexware/` ve `payroll/datev/` altinda bunu
 * uygulayacak.
 *
 * BU DOSYA `src/invoicing/datev` ILE HICBIR SEY PAYLASMAZ. Orasi
 * Rechnungswesen (EXTF Buchungsstapel), burasi Lohn. Ortak bir "DATEV"
 * soyutlamasi altinda birlestirilirse yanlis dosya yanlis muhasebeye gider.
 */

/** Hedef sisteme yazilirken gereken, hareketin disindaki baglam. */
export type PayrollExportContext = {
  targetSystem: PayrollTargetSystem;
  /**
   * DATEV Berater-/Mandantennummer. Lexware hedeflerinde NULL — o urun boyle
   * bir kimlik istemiyor. Yazici bos gecebilmeli; zorunlu yapmak Lexware'i
   * hicbir zaman ihrac edilemez birakirdi.
   */
  consultantNumber: string | null;
  clientNumber: string | null;
  year: number;
  month: number;
  /** Dosyanin uretildigi an; bicimlerin ust bilgisinde yer aliyor. */
  generatedAt: Date;
};

/**
 * Bir bicim yazicisinin sozlesmesi.
 *
 * Notr CSV de, DATEV ASCII de, Lexware ASCII de bunu uyguluyor; boylece ihracat
 * servisi hangi dosyayi urettigini bilmeden calisiyor.
 */
export interface PayrollFileWriter {
  readonly id: string;
  /** Dosya adi uzantisi dahil. */
  fileName(context: PayrollExportContext): string;
  render(movements: readonly NormalizedPayrollMovement[], context: PayrollExportContext): string;
}
