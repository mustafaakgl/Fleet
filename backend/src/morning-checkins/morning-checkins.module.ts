import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MorningCheckinsController } from './morning-checkins.controller';
import { MorningCheckinsService } from './morning-checkins.service';

@Module({
  imports: [PrismaModule, AuditModule, NotificationsModule],
  controllers: [MorningCheckinsController],
  providers: [MorningCheckinsService],
  exports: [MorningCheckinsService],
})
export class MorningCheckinsModule {}
