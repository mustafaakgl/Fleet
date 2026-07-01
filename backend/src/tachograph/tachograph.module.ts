import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TachographController } from './tachograph.controller';
import { TachographService } from './tachograph.service';
import { TachoIngestTokenGuard } from './guards/tacho-ingest-token.guard';

@Module({
  imports: [PrismaModule],
  controllers: [TachographController],
  providers: [TachographService, TachoIngestTokenGuard],
  exports: [TachographService],
})
export class TachographModule {}
