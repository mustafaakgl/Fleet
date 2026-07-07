import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TranslationModule } from '../translation/translation.module';
import { MessengerController } from './messenger.controller';
import { MessengerService } from './messenger.service';
import { MessengerViewerTranslationService } from './messenger-viewer-translation.service';

@Module({
  imports: [PrismaModule, TranslationModule, AuditModule, NotificationsModule],
  controllers: [MessengerController],
  providers: [MessengerService, MessengerViewerTranslationService],
  exports: [MessengerService],
})
export class MessengerModule {}
