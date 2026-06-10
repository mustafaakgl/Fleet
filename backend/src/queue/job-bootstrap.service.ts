import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CompanyEmailsService } from '../company-emails/company-emails.service';
import { DriverBirthdaysService } from '../drivers/driver-birthdays.service';
import { PrivacyService } from '../privacy/privacy.service';
import { LicenseChecksService } from '../license-compliance/license-checks.service';
import { DepartureChecksService } from '../departure-check/departure-checks.service';
import { FinesService } from '../fine-management/fines.service';
import { RemindersService } from '../reminders/reminders.service';
import { QueueService } from './queue.service';

@Injectable()
export class JobBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(JobBootstrapService.name);

  constructor(
    private readonly queue: QueueService,
    private readonly reminders: RemindersService,
    private readonly privacy: PrivacyService,
    private readonly driverBirthdays: DriverBirthdaysService,
    private readonly companyEmails: CompanyEmailsService,
    private readonly licenseChecks: LicenseChecksService,
    private readonly departureChecks: DepartureChecksService,
    private readonly fines: FinesService,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler('reminders.generate', async () => {
      const result = await this.reminders.generateReminders();
      this.logger.log(
        `Compliance reminders: candidates=${result.totalCandidates}, created=${result.created}`,
      );
    });

    this.queue.registerHandler('privacy.retention', async () => {
      const tasks: Array<{ name: string; run: () => Promise<{ deleted: number; cutoff: string }> }> =
        [
          { name: 'location_history', run: () => this.privacy.purgeOldLocationHistory() },
          { name: 'audit_logs', run: () => this.privacy.purgeOldAuditLogs() },
          { name: 'notifications', run: () => this.privacy.purgeOldNotifications() },
          { name: 'messages', run: () => this.privacy.purgeOldMessages() },
          { name: 'expired_documents', run: () => this.privacy.purgeExpiredDocuments() },
        ];

      for (const task of tasks) {
        const result = await task.run();
        this.logger.log(`Retention [${task.name}]: deleted=${result.deleted}, cutoff=${result.cutoff}`);
      }
    });

    this.queue.registerHandler('drivers.birthdays', async () => {
      const result = await this.driverBirthdays.sendTodayBirthdayNotifications();
      this.logger.log(
        `Birthday notifications: sent=${result.sent}, skipped=${result.skipped}, candidates=${result.candidates}`,
      );
    });

    this.queue.registerHandler('license_checks.daily', async () => {
      const result = await this.licenseChecks.runDailyJobs();
      const retentionMonths = Number(process.env.LICENSE_CHECK_RETENTION_MONTHS ?? 6);
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - (Number.isFinite(retentionMonths) ? retentionMonths : 6));
      const purged = await this.licenseChecks.purgeRetainedData(cutoff);
      this.logger.log(
        `License checks: periodic=${result.periodicRequests}, reminders=${result.reminders}, escalations=${result.escalations}, expiry=${result.expiryNotices}, purged=${purged}`,
      );
    });

    this.queue.registerHandler('fines.daily', async () => {
      const result = await this.fines.runDailyJobs();
      this.logger.log(
        `Fines: payment_reminders=${result.paymentReminders}, driver_escalations=${result.driverEscalations}`,
      );
    });

    this.queue.registerHandler('departure_checks.daily', async () => {
      const result = await this.departureChecks.runDailyJobs();
      this.logger.log(
        `Departure checks: reminders=${result.reminders}, escalations=${result.escalations}, purged=${result.purged}`,
      );
    });

    this.queue.registerHandler('company_emails.tomorrow', async (payload) => {
      const date =
        payload && typeof payload === 'object' && 'date' in payload && typeof payload.date === 'string'
          ? payload.date
          : undefined;
      if (!date) {
        throw new Error('company_emails.tomorrow job requires { date: "YYYY-MM-DD" }');
      }
      const result = await this.companyEmails.runScheduledEmailsForDate(date);
      this.logger.log(
        `Company emails for ${result.date}: drafts=${result.draftsCreated}, sent=${result.sent}, failed=${result.failed}, skipped=${result.skipped}`,
      );
    });
  }
}
