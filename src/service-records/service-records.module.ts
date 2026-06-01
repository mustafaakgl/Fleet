import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ServiceRecordsController } from './service-records.controller';
import { ServiceRecordsService } from './service-records.service';

@Module({
  imports: [PrismaModule],
  controllers: [ServiceRecordsController],
  providers: [ServiceRecordsService],
  exports: [ServiceRecordsService],
})
export class ServiceRecordsModule {}
