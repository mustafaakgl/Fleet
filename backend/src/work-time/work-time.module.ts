import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BreakCandidateController } from './break-candidate.controller';
import { BreakCandidateService } from './break-candidate.service';
import { WorkTimeService } from './work-time.service';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [BreakCandidateController],
  providers: [WorkTimeService, BreakCandidateService],
  exports: [WorkTimeService, BreakCandidateService],
})
export class WorkTimeModule {}
