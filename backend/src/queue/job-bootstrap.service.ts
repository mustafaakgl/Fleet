import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DriverBirthdaysService } from '../drivers/driver-birthdays.service';
import { PrivacyService } from '../privacy/privacy.service';
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
  }
}
