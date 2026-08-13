import { Injectable } from '@nestjs/common';
import type {
  FuelReceiptOcrDataMode,
  FuelReceiptOcrProvider,
  FuelReceiptOcrResult,
} from './fuel-receipt-ocr.types';

/**
 * OCR kapali.
 *
 * VARSAYILAN SAGLAYICI BUDUR ve bu bilincli bir karar: repoda onaylanmis,
 * yapilandirilmis bir OCR servisi YOK (ne kod ne bagimlilik). Rastgele bir
 * ucretli servisi varsayilan yapmak, kimsenin sozlesme imzalamadigi bir
 * saticiya sessiz bir bagimlilik uretirdi.
 *
 * "Kapali" burada "bozuk" DEMEK DEGIL: fis yine yuklenir, saklanir ve surucu
 * formu ELLE doldurup gonderir. Kaybolan tek sey otomatik on doldurmadir.
 * Gercek bir saglayici geldiginde tek adaptor yazip modulde token'i degistirmek
 * yeterli — servis, uclar, arayuz ve testler aynen kalir.
 */
@Injectable()
export class DisabledFuelReceiptOcrProvider implements FuelReceiptOcrProvider {
  readonly name = 'disabled';
  readonly version = 'none';
  /**
   * 'live': uretilen veri demo DEGIL — hic veri uretilmiyor. Arayuzun "demo
   * verisi" uyarisi gostermemesi gerekiyor, cunku gosterecek bir sey yok.
   */
  readonly dataMode: FuelReceiptOcrDataMode = 'live';

  isConfigured(): boolean {
    return false;
  }

  async analyze(): Promise<FuelReceiptOcrResult> {
    return { ok: false, errorClass: 'not_configured' };
  }
}
