import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InvitationsModule } from '../invitations/invitations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverBirthdaysScheduler } from './driver-birthdays.scheduler';
import { DriverBirthdaysService } from './driver-birthdays.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { LicenseComplianceModule } from '../license-compliance/license-compliance.module';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule, InvitationsModule, LicenseComplianceModule],
  controllers: [DriversController],
  providers: [DriversService, DriverBirthdaysService, DriverBirthdaysScheduler],
  exports: [DriversService, DriverBirthdaysService],
})
export class DriversModule {}
