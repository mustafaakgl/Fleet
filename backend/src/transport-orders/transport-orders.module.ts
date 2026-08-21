import { Module } from '@nestjs/common';
import { AssignmentsModule } from '../assignments/assignments.module';
import { RoutingModule } from '../routing/routing.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportOrdersController } from './transport-orders.controller';
import { TransportOrdersService } from './transport-orders.service';

/**
 * Ticari siparis omurgasi (Faz 15).
 *
 * Bu fazda FATURA URETILMEZ ve paralel bir invoice modeli kurulmaz. Operasyon
 * tarafina bagliyken bile `Assignment` mevcut servisi uzerinden gider —
 * ikinci bir gorev olusturma yolu acilmaz.
 */
@Module({
  // RoutingModule (Faz 17g): kalem adreslerini `Location` kaydina baglamak icin.
  imports: [PrismaModule, AuditModule, AssignmentsModule, RoutingModule],
  controllers: [TransportOrdersController],
  providers: [TransportOrdersService],
  exports: [TransportOrdersService],
})
export class TransportOrdersModule {}
