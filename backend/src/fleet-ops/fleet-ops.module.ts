import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FleetOpsController } from './fleet-ops.controller';
import { FleetOpsGuard } from './fleet-ops.guard';
import { FleetOpsService } from './fleet-ops.service';

@Module({
  imports: [AuthModule, PrismaModule, AuditModule, OnboardingModule],
  controllers: [FleetOpsController],
  providers: [FleetOpsService, FleetOpsGuard],
})
export class FleetOpsModule {}
