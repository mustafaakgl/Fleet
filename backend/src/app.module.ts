import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { DriversModule } from './drivers/drivers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { CompaniesModule } from './companies/companies.module';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './prisma/prisma.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { TransportRequestsModule } from './transport-requests/transport-requests.module';
import { CalendarModule } from './calendar/calendar.module';
import { RequestsModule } from './requests/requests.module';
import { LeaveRequestsModule } from './leave-requests/leave-requests.module';
import { DocumentsModule } from './documents/documents.module';
import { VehicleHandoversModule } from './vehicle-handovers/vehicle-handovers.module';
import { AccidentsModule } from './accidents/accidents.module';
import { CompanyEmailsModule } from './company-emails/company-emails.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RemindersModule } from './reminders/reminders.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SearchModule } from './search/search.module';
import { ServiceRecordsModule } from './service-records/service-records.module';
import { MorningCheckinsModule } from './morning-checkins/morning-checkins.module';
import { DriverMobileModule } from './driver-mobile/driver-mobile.module';
import { MessengerModule } from './messenger/messenger.module';
import { AuditModule } from './audit/audit.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { TrackingModule } from './tracking/tracking.module';
import { CustomerPortalModule } from './customer-portal/customer-portal.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    UsersModule,
    DriversModule,
    VehiclesModule,
    CompaniesModule,
    CommonModule,
    PrismaModule,
    AssignmentsModule,
    TransportRequestsModule,
    CalendarModule,
    RequestsModule,
    LeaveRequestsModule,
    DocumentsModule,
    VehicleHandoversModule,
    AccidentsModule,
    CompanyEmailsModule,
    NotificationsModule,
    RemindersModule,
    DashboardModule,
    SearchModule,
    ServiceRecordsModule,
    MorningCheckinsModule,
    DriverMobileModule,
    MessengerModule,
    AuditModule,
    PushNotificationsModule,
    TrackingModule,
    CustomerPortalModule,
  ],
})
export class AppModule {}
