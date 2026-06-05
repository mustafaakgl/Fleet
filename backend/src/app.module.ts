import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { PrivacyModule } from './privacy/privacy.module';
import { MailModule } from './mail/mail.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { InvitationsModule } from './invitations/invitations.module';
import { ImportModule } from './import/import.module';
import { BillingModule } from './billing/billing.module';
import { TenantModule } from './tenant/tenant.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { StorageModule } from './storage/storage.module';
import { ThrottlerAuditFilter } from './common/filters/throttler-audit.filter';
import { SentryExceptionFilter } from './common/filters/sentry-exception.filter';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor';
import { ApiVersionInterceptor } from './common/interceptors/api-version.interceptor';
import { WriteRoleGuard } from './common/guards/write-role.guard';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
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
    PrivacyModule,
    MailModule,
    OnboardingModule,
    InvitationsModule,
    ImportModule,
    BillingModule,
    TenantModule,
    HealthModule,
    MetricsModule,
    StorageModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: WriteRoleGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RequestLoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiVersionInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: ThrottlerAuditFilter,
    },
    {
      provide: APP_FILTER,
      useClass: SentryExceptionFilter,
    },
  ],
})
export class AppModule {}
