import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';
import { FleetModule } from '../fleet.module';
import { FuelStationsModule } from '../fuel-stations/fuel-stations.module';
import { DisabledFuelReceiptOcrProvider } from './disabled-fuel-receipt-ocr.provider';
import { resolveFuelReceiptOcrProviderKind } from './fuel-receipt-ocr.config';
import { FUEL_RECEIPT_OCR_PROVIDER } from './fuel-receipt-ocr.types';
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
  imports: [PrismaModule, AuditModule, NotificationsModule, StorageModule, FleetModule, FuelStationsModule],
  controllers: [FuelReceiptDriverController],
  providers: [
    MockFuelReceiptOcrProvider,
    DisabledFuelReceiptOcrProvider,
    {
      // Saglayici ACILISTA seciliyor, istek basina degil: yanlis yapilandirma
      // ilk surucu istegini bekleyip sessizce bos sonuc uretmek yerine surec
      // baslarken duyulur olmali. resolveFuelReceiptOcrProviderKind uretimde
      // mock secilmisse burada firlatir ve modul kurulumu basarisiz olur.
      provide: FUEL_RECEIPT_OCR_PROVIDER,
      useFactory: (mock: MockFuelReceiptOcrProvider, disabled: DisabledFuelReceiptOcrProvider) =>
        resolveFuelReceiptOcrProviderKind() === 'mock' ? mock : disabled,
      inject: [MockFuelReceiptOcrProvider, DisabledFuelReceiptOcrProvider],
    },
    FuelReceiptService,
  ],
})
export class FuelReceiptsModule {}
