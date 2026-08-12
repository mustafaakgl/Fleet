import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { WorkSessionsModule } from '../work-sessions/work-sessions.module';
import { DriverVehicleService } from './driver-vehicle.service';
import { FleetDriverScoreController, FleetDriverScoreDriverController } from './fleet-driver-score.controller';
import { FleetDriverScoreService } from './fleet-driver-score.service';
import {
  FleetFuelController,
  FleetFuelDriverController,
  FleetFuelAnalyticsDriverController,
  FleetFuelCockpitController,
  FleetFuelOverviewController,
  FleetVehicleFuelAnalyticsController,
} from './fleet-fuel.controller';
import { FuelCardReconciliationController } from './fuel-card-reconciliation.controller';
import { FleetFuelService } from './fleet-fuel.service';
import { FuelCardReconciliationService } from './fuel-card-reconciliation.service';
import {
  FleetMaintenanceController,
  FleetVehicleMaintenanceController,
} from './fleet-maintenance.controller';
import { FleetMaintenanceScheduler } from './fleet-maintenance.scheduler';
import { FleetMaintenanceService } from './fleet-maintenance.service';
import { FleetTripProcessingService } from './fleet-trip-processing.service';
import {
  FleetVehicleStatusController,
  FleetVehicleStatusDriverController,
} from './fleet-vehicle-status.controller';
import { FleetVehicleStatusService } from './fleet-vehicle-status.service';
import { FleetTripsController, FleetTripsDriverController } from './fleet-trips.controller';
import { FleetTripsScheduler } from './fleet-trips.scheduler';
import { FleetTripsService } from './fleet-trips.service';

@Module({
  imports: [PrismaModule, WorkSessionsModule, NotificationsModule, PushNotificationsModule, AuditModule],
  controllers: [
    FleetTripsController,
    FleetTripsDriverController,
    FleetDriverScoreController,
    FleetDriverScoreDriverController,
    FleetFuelController,
    FleetFuelDriverController,
    FleetFuelAnalyticsDriverController,
    FleetFuelCockpitController,
    FleetFuelOverviewController,
    FuelCardReconciliationController,
    FleetVehicleFuelAnalyticsController,
    FleetVehicleStatusController,
    FleetVehicleStatusDriverController,
    FleetMaintenanceController,
    FleetVehicleMaintenanceController,
  ],
  providers: [
    DriverVehicleService,
    FleetTripsService,
    FleetTripProcessingService,
    FleetTripsScheduler,
    FleetDriverScoreService,
    FleetFuelService,
    FuelCardReconciliationService,
    FleetVehicleStatusService,
    FleetMaintenanceService,
    FleetMaintenanceScheduler,
  ],
  exports: [
    // "Surucunun bugunku araci" mantigi: FuelStationsModule bunu tekrar
    // yazmasin diye disari veriliyor.
    DriverVehicleService,
    FleetTripsService,
    FleetTripProcessingService,
    FleetDriverScoreService,
    FleetFuelService,
    FleetVehicleStatusService,
    FleetMaintenanceService,
  ],
})
export class FleetModule {}
