import { Module } from '@nestjs/common';
import { FleetModule } from '../fleet/fleet.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TelematicsController } from './telematics.controller';
import { TelematicsService } from './telematics.service';

@Module({
  imports: [PrismaModule, FleetModule],
  controllers: [TelematicsController],
  providers: [TelematicsService],
})
export class TelematicsModule {}
