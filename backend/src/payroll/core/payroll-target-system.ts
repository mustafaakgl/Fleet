import { PayrollTargetSystem } from '@prisma/client';

/**
 * Hedef bordro urunu → saglayici.
 *
 * Saglayici veritabaninda AYRI ALAN OLARAK TUTULMUYOR, buradan turetiliyor.
 * Iki alan olsaydi "provider=lexware + system=datev_lodas" gibi celiskili bir
 * satir yazmak mumkun olurdu ve o satiri hangi yazicinin isleyecegi belirsiz
 * kalirdi. Tek alan bu durumu imkansiz kiliyor.
 */

export type PayrollProvider = 'datev' | 'lexware';

const PROVIDERS: Readonly<Record<PayrollTargetSystem, PayrollProvider>> = {
  [PayrollTargetSystem.datev_lodas]: 'datev',
  [PayrollTargetSystem.datev_lohn_und_gehalt]: 'datev',
  [PayrollTargetSystem.lexware_lohn_und_gehalt]: 'lexware',
};

export function providerOf(targetSystem: PayrollTargetSystem): PayrollProvider {
  return PROVIDERS[targetSystem];
}

/**
 * Hedefin Berater-/Mandantennummer istemesi.
 *
 * DATEV'e ozgu: dosya ust bilgisi bu iki numarayi tasiyor ve yanlis numara
 * dosyayi baska bir mandanta yazar. Lexware ASCII import'unda boyle bir kimlik
 * yok — dosya zaten acik olan sirkete aktariliyor. Hazirlik kontrolu bu yuzden
 * iki numarayi HEDEFE GORE ariyor; herkesten istemek Lexware'i kalici olarak
 * "hazir degil" durumunda birakirdi.
 */
export function requiresDatevMandant(targetSystem: PayrollTargetSystem): boolean {
  return providerOf(targetSystem) === 'datev';
}
