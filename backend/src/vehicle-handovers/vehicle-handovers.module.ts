import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { VehicleHandoversController } from './vehicle-handovers.controller';
import { VehicleHandoversService } from './vehicle-handovers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [VehicleHandoversController],
  providers: [VehicleHandoversService],
  exports: [VehicleHandoversService],
})
export class VehicleHandoversModule {}
