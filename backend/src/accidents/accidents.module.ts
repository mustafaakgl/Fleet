import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AccidentsController } from './accidents.controller';
import { AccidentsService } from './accidents.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AccidentsController],
  providers: [AccidentsService],
  exports: [AccidentsService],
})
export class AccidentsModule {}
