import { Module } from '@nestjs/common';
import { VehicleHandoversController } from './vehicle-handovers.controller';
import { VehicleHandoversService } from './vehicle-handovers.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VehicleHandoversController],
  providers: [VehicleHandoversService],
  exports: [VehicleHandoversService],
})
export class VehicleHandoversModule {}
