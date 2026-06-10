import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { StorageModule } from '../storage/storage.module';
import { DriverLicensesController } from './driver-licenses.controller';
import { DriverLicensesService } from './driver-licenses.service';
import { LicenseChecksController } from './license-checks.controller';
import { LicenseChecksDriverController } from './license-checks-driver.controller';
import { LicenseChecksService } from './license-checks.service';
import { LicenseComplianceScheduler } from './license-compliance.scheduler';
import { LicenseComplianceService } from './license-compliance.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    StorageModule,
    NotificationsModule,
    PushNotificationsModule,
  ],
  controllers: [
    DriverLicensesController,
    LicenseChecksController,
    LicenseChecksDriverController,
  ],
  providers: [
    DriverLicensesService,
    LicenseChecksService,
    LicenseComplianceService,
    LicenseComplianceScheduler,
  ],
  exports: [LicenseComplianceService, LicenseChecksService, DriverLicensesService],
})
export class LicenseComplianceModule {}
