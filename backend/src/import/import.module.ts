import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CompaniesModule } from '../companies/companies.module';
import { DriversModule } from '../drivers/drivers.module';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [PrismaModule, AuditModule, DriversModule, VehiclesModule, CompaniesModule, UsersModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
