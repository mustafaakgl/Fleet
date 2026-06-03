import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverBirthdaysScheduler } from './driver-birthdays.scheduler';
import { DriverBirthdaysService } from './driver-birthdays.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [DriversController],
  providers: [DriversService, DriverBirthdaysService, DriverBirthdaysScheduler],
  exports: [DriversService, DriverBirthdaysService],
})
export class DriversModule {}
