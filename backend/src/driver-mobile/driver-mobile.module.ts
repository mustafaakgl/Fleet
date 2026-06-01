import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { DriverMobileController } from './driver-mobile.controller';
import { DriverMobileService } from './driver-mobile.service';

@Module({
  imports: [PrismaModule, StorageModule, MulterModule.register({})],
  controllers: [DriverMobileController],
  providers: [DriverMobileService],
  exports: [DriverMobileService],
})
export class DriverMobileModule {}
