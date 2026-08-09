import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkTimeService } from './work-time.service';

@Module({
  imports: [PrismaModule],
  providers: [WorkTimeService],
  exports: [WorkTimeService],
})
export class WorkTimeModule {}
