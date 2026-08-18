import { Module } from '@nestjs/common';
import { AuditModule } from '../../audit/audit.module';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { FuelReconciliationController } from './fuel-reconciliation.controller';
import { FuelReconciliationReviewService } from './fuel-reconciliation-review.service';
import { FuelReconciliationScheduler } from './fuel-reconciliation.scheduler';
import { FuelReconciliationService } from './fuel-reconciliation.service';

/**
 * Yakit fisi / telematik mutabakati (Faz 11).
 *
 * FuelReceiptsModule bu modulu ICE AKTARIR: fis onayi, analiz kaydini KENDI
 * transaction'inda yaratiyor. Ters yonde bagimlilik YOK — mutabakat, fis
 * servislerinin hicbirini cagirmiyor; bu sayede dairesel bagimlilik olusmuyor
 * ve analizin fisi degistiremeyecegi yapisal olarak garanti.
 */
@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [FuelReconciliationController],
  providers: [
    FuelReconciliationService,
    FuelReconciliationReviewService,
    FuelReconciliationScheduler,
  ],
  exports: [FuelReconciliationService, FuelReconciliationReviewService],
})
export class FuelReconciliationModule {}
