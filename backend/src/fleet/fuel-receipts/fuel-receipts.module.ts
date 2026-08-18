import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';
import { FleetModule } from '../fleet.module';
import { FuelReconciliationModule } from '../fuel-reconciliation/fuel-reconciliation.module';
import { FuelStationsModule } from '../fuel-stations/fuel-stations.module';
import { AzureDocumentIntelligenceFuelReceiptOcrProvider } from './azure-document-intelligence-fuel-receipt-ocr.provider';
import { resolveAzureDocumentIntelligenceConfig } from './azure-document-intelligence.config';
import { DisabledFuelReceiptOcrProvider } from './disabled-fuel-receipt-ocr.provider';
import { resolveFuelReceiptOcrProviderKind } from './fuel-receipt-ocr.config';
import { FUEL_RECEIPT_OCR_PROVIDER } from './fuel-receipt-ocr.types';
import { FuelReceiptReversalService } from './fuel-receipt-reversal.service';
import { FuelReceiptReviewController } from './fuel-receipt-review.controller';
import { FuelReceiptReviewService } from './fuel-receipt-review.service';
import { FuelReceiptDriverController } from './fuel-receipt.controller';
import { FuelReceiptService } from './fuel-receipt.service';
import { MockFuelReceiptOcrProvider } from './mock-fuel-receipt-ocr.provider';

/**
 * Yakit fisi katmani (Faz 6).
 *
 * Saglayici somut sinif yerine FUEL_RECEIPT_OCR_PROVIDER token'i uzerinden
 * baglaniyor: gercek bir OCR servisi geldiginde degisen tek yer bu satir.
 *
 * FuelStationsModule'den YALNIZCA VehicleFuelCompatibilityService aliniyor —
 * yakit uyumlulugu mantigi kopyalanmadi, tek yerde duruyor.
 */
@Module({
  imports: [
    PrismaModule,
    AuditModule,
    NotificationsModule,
    StorageModule,
    FleetModule,
    FuelStationsModule,
    // Faz 11: onay, analiz kaydini KENDI transaction'inda yaratiyor.
    FuelReconciliationModule,
  ],
  controllers: [
    FuelReceiptDriverController,
    // Muhasebe incelemesi AYNI modulde: ayni canonical kayit uzerinde
    // calisiyorlar ve iki modul olsaydi durum kurallari iki yerde yasardi.
    FuelReceiptReviewController,
  ],
  providers: [
    MockFuelReceiptOcrProvider,
    DisabledFuelReceiptOcrProvider,
    {
      // Saglayici ACILISTA seciliyor, istek basina degil: yanlis yapilandirma
      // ilk surucu istegini bekleyip sessizce bos sonuc uretmek yerine surec
      // baslarken duyulur olmali. resolveFuelReceiptOcrProviderKind uretimde
      // mock secilmisse burada firlatir ve modul kurulumu basarisiz olur.
      provide: FUEL_RECEIPT_OCR_PROVIDER,
      useFactory: (mock: MockFuelReceiptOcrProvider, disabled: DisabledFuelReceiptOcrProvider) => {
        const kind = resolveFuelReceiptOcrProviderKind();
        if (kind === 'mock') return mock;
        if (kind === 'azure_document_intelligence') {
          // FAIL-FAST: eksik/gecersiz yapilandirma BURADA firlatir ve modul
          // kurulumu basarisiz olur. Ilk surucu istegini bekleyip orada
          // sessizce "okunamadi" uretmek, yanlis yapilandirmayi gorunmez
          // kilardi.
          return new AzureDocumentIntelligenceFuelReceiptOcrProvider(
            resolveAzureDocumentIntelligenceConfig(),
          );
        }
        return disabled;
      },
      inject: [MockFuelReceiptOcrProvider, DisabledFuelReceiptOcrProvider],
    },
    FuelReceiptService,
    FuelReceiptReviewService,
    // Ters kayit AYNI modulde: durum kurallari ve kayit cozumu tek yerde
    // kalsin diye inceleme servisini yeniden kullaniyor.
    FuelReceiptReversalService,
  ],
})
export class FuelReceiptsModule {}
