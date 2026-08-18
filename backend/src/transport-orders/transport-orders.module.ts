import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TransportOrdersService } from './transport-orders.service';

/**
 * Ticari siparis omurgasi (Faz 15).
 *
 * Bu fazda FATURA URETILMEZ ve paralel bir invoice modeli kurulmaz. Operasyon
 * tarafina bagliyken bile `Assignment` mevcut servisi uzerinden gider —
 * ikinci bir gorev olusturma yolu acilmaz.
 */
@Module({
  imports: [PrismaModule, AuditModule],
  providers: [TransportOrdersService],
  exports: [TransportOrdersService],
})
export class TransportOrdersModule {}
