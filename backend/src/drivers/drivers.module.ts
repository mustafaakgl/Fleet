import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DriverBirthdaysService } from './driver-birthdays.service';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [DriversController],
  providers: [DriversService, DriverBirthdaysService],
  exports: [DriversService, DriverBirthdaysService],
})
export class DriversModule {}
