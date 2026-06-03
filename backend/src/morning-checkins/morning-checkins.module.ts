import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MorningCheckinsController } from './morning-checkins.controller';
import { MorningCheckinsService } from './morning-checkins.service';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [MorningCheckinsController],
  providers: [MorningCheckinsService],
  exports: [MorningCheckinsService],
})
export class MorningCheckinsModule {}
