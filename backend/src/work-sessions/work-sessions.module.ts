import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkSessionsController } from './work-sessions.controller';
import { WorkSessionsService } from './work-sessions.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkSessionsController],
  providers: [WorkSessionsService],
  exports: [WorkSessionsService],
})
export class WorkSessionsModule {}
