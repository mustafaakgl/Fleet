import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { StorageModule } from '../storage/storage.module';
import { ChecklistTemplatesController } from './checklist-templates.controller';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { DefectsController } from './defects.controller';
import { DefectsDriverController } from './defects-driver.controller';
import { DefectsService } from './defects.service';
import { DepartureChecksController } from './departure-checks.controller';
import { DepartureChecksDriverController } from './departure-checks-driver.controller';
import { DepartureChecksService } from './departure-checks.service';
import { DepartureCheckScheduler } from './departure-check.scheduler';
import { DepartureCheckService } from './departure-check.service';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    StorageModule,
    NotificationsModule,
    PushNotificationsModule,
  ],
  controllers: [
    ChecklistTemplatesController,
    DepartureChecksController,
    DepartureChecksDriverController,
    DefectsController,
    DefectsDriverController,
  ],
  providers: [
    ChecklistTemplatesService,
    DepartureCheckService,
    DepartureChecksService,
    DefectsService,
    DepartureCheckScheduler,
  ],
  exports: [DepartureCheckService, DepartureChecksService, DefectsService, ChecklistTemplatesService],
})
export class DepartureCheckModule {}
