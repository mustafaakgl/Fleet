import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { FuelProductType } from '@prisma/client';
import {
  emptyExtraction,
  type FuelReceiptOcrDataMode,
  type FuelReceiptOcrInput,
  type FuelReceiptOcrProvider,
  type FuelReceiptOcrResult,
  type NormalizedFuelReceiptExtraction,
} from './fuel-receipt-ocr.types';

/**
 * Demo OCR saglayicisi.
 *
 * AG CAGRISI YOK. Amaci arayuz akisini gercek OCR yapilmis gibi sinamak:
 * yuksek/dusuk guven, karma fis, eksik alan ve basarisizlik yollarinin hepsi
 * gercek bir saglayicida da olusur ve hepsi burada temsil ediliyor.
 *
 * DETERMINISTIK: hangi fixture'in donecegi dosya yolunun hash'inden secilir.
 * Rastgele olsaydi ayni fis her analizde baska deger verir, test edilemezdi.
 * Dosya adinda acik bir ipucu varsa (ornegin "mixed") o fixture secilir —
 * gorsel dogrulama sirasinda istenen senaryoyu kurmanin yolu budur.
 *
 * Ciktinin demo oldugu `dataMode` ile bildirilir; istemci bunu kendi ortam
 * degiskeninden TAHMIN ETMEZ.
 */
@Injectable()
export class MockFuelReceiptOcrProvider implements FuelReceiptOcrProvider {
  readonly name = 'mock';
  readonly version = 'fixtures-1';
  readonly dataMode: FuelReceiptOcrDataMode = 'mock';

  isConfigured(): boolean {
    return true;
  }

  async analyze(input: FuelReceiptOcrInput): Promise<FuelReceiptOcrResult> {
    const fixture = this.pickFixture(input.originalName, input.absolutePath);

    if (fixture === 'failure') {
      // Gercek saglayicilarda en sik gorulen sonuc: okunamayan fotograf.
      // Kayit KAYBOLMAZ; surucu formu elle doldurur.
      return { ok: false, errorClass: 'unreadable' };
    }

    return { ok: true, extraction: this.build(fixture) };
  }

  /**
   * Fixture secimi: once ORIJINAL dosya adindaki ipucu, yoksa depolanan yoldan
   * deterministik hash. Rastgele olsaydi ayni fis her analizde baska deger
   * verir ve test edilemezdi.
   */
  private pickFixture(originalName: string, absolutePath: string): FixtureKind {
    const lower = originalName.toLowerCase();
    for (const kind of FIXTURE_ORDER) {
      if (lower.includes(kind)) {
        return kind;
      }
    }

    const digest = createHash('sha256').update(absolutePath).digest();
    return FIXTURE_ORDER[digest[0] % FIXTURE_ORDER.length]!;
  }

  private build(kind: FixtureKind): NormalizedFuelReceiptExtraction {
    const base = emptyExtraction();

    switch (kind) {
      /** 1) Standart Almanca dizel fisi — her alan yuksek guvenli. */
      case 'diesel':
        return {
          ...base,
          stationName: { value: 'Aral Tankstelle Duisburg Hafen', confidence: 0.97 },
          stationAddress: { value: 'Hafenstraße 12, 47059 Duisburg', confidence: 0.94 },
          receiptNumber: { value: 'RG-2026-884201', confidence: 0.95 },
          purchasedAt: { value: '2026-08-13T08:42:00.000Z', confidence: 0.93 },
          fuelProduct: { value: FuelProductType.DIESEL, confidence: 0.98 },
          liters: { value: 62.35, confidence: 0.96 },
          pricePerLiter: { value: 1.719, confidence: 0.96 },
          fuelGrossAmount: { value: 107.18, confidence: 0.97 },
          receiptGrossAmount: { value: 107.18, confidence: 0.97 },
          receiptNetAmount: { value: 90.07, confidence: 0.92 },
          receiptVatAmount: { value: 17.11, confidence: 0.92 },
          receiptVatRate: { value: 19, confidence: 0.95 },
          currency: { value: 'EUR', confidence: 0.99 },
          paymentMethod: { value: 'Firmenkarte', confidence: 0.88 },
          plateNumber: { value: 'DU-AB 123', confidence: 0.86 },
        };

      /** 2) E5/E10 benzin fisi. */
      case 'petrol':
        return {
          ...base,
          stationName: { value: 'Shell Station Oberhausen', confidence: 0.95 },
          stationAddress: { value: 'Mülheimer Straße 8, 46045 Oberhausen', confidence: 0.9 },
          receiptNumber: { value: '2026-0913-77', confidence: 0.91 },
          purchasedAt: { value: '2026-08-13T11:05:00.000Z', confidence: 0.9 },
          fuelProduct: { value: FuelProductType.SUPER_E10, confidence: 0.93 },
          liters: { value: 41.2, confidence: 0.94 },
          pricePerLiter: { value: 1.789, confidence: 0.94 },
          fuelGrossAmount: { value: 73.71, confidence: 0.95 },
          receiptGrossAmount: { value: 73.71, confidence: 0.95 },
          receiptVatRate: { value: 19, confidence: 0.9 },
          currency: { value: 'EUR', confidence: 0.99 },
          paymentMethod: { value: 'EC-Karte', confidence: 0.84 },
        };

      /**
       * 3) Dusuk guvenli alanlar — burusuk/soluk fis.
       * Degerler DOLU ama guven dusuk: arayuz bunlari isaretlemeli, surucu
       * kontrol etmeden onaylamamali.
       */
      case 'lowconf':
        return {
          ...base,
          stationName: { value: 'ESSO STATIO', confidence: 0.41 },
          receiptNumber: { value: '00B4?21', confidence: 0.29 },
          purchasedAt: { value: '2026-08-12T00:00:00.000Z', confidence: 0.38 },
          fuelProduct: { value: FuelProductType.DIESEL, confidence: 0.44 },
          liters: { value: 48.9, confidence: 0.36 },
          pricePerLiter: { value: 1.699, confidence: 0.33 },
          fuelGrossAmount: { value: 83.09, confidence: 0.35 },
          receiptGrossAmount: { value: 83.09, confidence: 0.35 },
          currency: { value: 'EUR', confidence: 0.72 },
        };

      /**
       * 4) KARMA FIS: yakit + market urunu.
       * Yakit toplami 88,40 ama kasada 95,60 odenmis. Genel toplami arac yakit
       * maliyeti olarak yazmak maliyeti 7,20 EUR sisirirdi.
       */
      case 'mixed':
        return {
          ...base,
          stationName: { value: 'Total Raststätte Bottrop', confidence: 0.93 },
          stationAddress: { value: 'Autobahn A2, 46242 Bottrop', confidence: 0.87 },
          receiptNumber: { value: 'B-556-2026', confidence: 0.9 },
          purchasedAt: { value: '2026-08-13T06:20:00.000Z', confidence: 0.91 },
          fuelProduct: { value: FuelProductType.DIESEL, confidence: 0.95 },
          liters: { value: 51.4, confidence: 0.93 },
          pricePerLiter: { value: 1.72, confidence: 0.92 },
          fuelGrossAmount: { value: 88.4, confidence: 0.94 },
          receiptGrossAmount: { value: 95.6, confidence: 0.94 },
          receiptVatRate: { value: 19, confidence: 0.9 },
          currency: { value: 'EUR', confidence: 0.99 },
          paymentMethod: { value: 'Firmenkarte', confidence: 0.86 },
          hasNonFuelItems: true,
        };

      /**
       * 5) EKSIK LITRE FIYATI — ayrica taninmayan yakit etiketi.
       * `fuelProduct.value` null ve ham metin rawFuelLabel'da: "Super" yazan
       * bir fisi E5 mi E10 mu diye TAHMIN ETMIYORUZ.
       */
      case 'nounitprice':
        return {
          ...base,
          stationName: { value: 'Freie Tankstelle Ruhrort', confidence: 0.89 },
          purchasedAt: { value: '2026-08-13T14:10:00.000Z', confidence: 0.88 },
          fuelProduct: { value: null, confidence: null },
          rawFuelLabel: 'SUPER',
          liters: { value: 39.8, confidence: 0.9 },
          fuelGrossAmount: { value: 70.05, confidence: 0.91 },
          receiptGrossAmount: { value: 70.05, confidence: 0.91 },
          currency: { value: 'EUR', confidence: 0.97 },
        };

      default:
        return base;
    }
  }
}

type FixtureKind = 'diesel' | 'petrol' | 'lowconf' | 'mixed' | 'nounitprice' | 'failure';

/** Sira sabit: fixture secimi deterministik olmali. */
const FIXTURE_ORDER: FixtureKind[] = [
  'diesel',
  'petrol',
  'lowconf',
  'mixed',
  'nounitprice',
  'failure',
];
