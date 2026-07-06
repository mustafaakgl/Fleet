import { forwardRef, Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MetricsModule } from '../metrics/metrics.module';
import { TachographModule } from './tachograph.module';
import { TachographQueueBootstrapService } from './tachograph-queue-bootstrap.service';
import { TachographQueueService } from './tachograph-queue.service';

@Global()
@Module({
  imports: [MetricsModule, PrismaModule, forwardRef(() => TachographModule)],
  providers: [TachographQueueService, TachographQueueBootstrapService],
  exports: [TachographQueueService],
})
export class TachographQueueModule {}
