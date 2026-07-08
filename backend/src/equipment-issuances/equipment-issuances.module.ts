import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DocumentsModule } from '../documents/documents.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import {
  DriverEquipmentIssuancesController,
  EquipmentIssuancesController,
} from './equipment-issuances.controller';
import { EquipmentIssuancesService } from './equipment-issuances.service';

@Module({
  imports: [PrismaModule, AuditModule, DocumentsModule, NotificationsModule, StorageModule],
  controllers: [EquipmentIssuancesController, DriverEquipmentIssuancesController],
  providers: [EquipmentIssuancesService],
  exports: [EquipmentIssuancesService],
})
export class EquipmentIssuancesModule {}