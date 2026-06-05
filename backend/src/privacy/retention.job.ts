import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrivacyService } from './privacy.service';

@Injectable()
export class PrivacyRetentionJob {
  private readonly logger = new Logger(PrivacyRetentionJob.name);

  constructor(private readonly privacyService: PrivacyService) {}

  /** Daily at 03:00 Europe/Berlin. Set RETENTION_CRON_ENABLED=false to disable. */
  @Cron('0 3 * * *', { timeZone: 'Europe/Berlin' })
  async runDailyRetention(): Promise<void> {
    if (process.env.RETENTION_CRON_ENABLED === 'false') {
      return;
    }

    const tasks: Array<{ name: string; run: () => Promise<{ deleted: number; cutoff: string }> }> = [
      { name: 'location_history', run: () => this.privacyService.purgeOldLocationHistory() },
      { name: 'audit_logs', run: () => this.privacyService.purgeOldAuditLogs() },
      { name: 'notifications', run: () => this.privacyService.purgeOldNotifications() },
      { name: 'messages', run: () => this.privacyService.purgeOldMessages() },
      { name: 'expired_documents', run: () => this.privacyService.purgeExpiredDocuments() },
    ];

    for (const task of tasks) {
      try {
        const result = await task.run();
        this.logger.log(
          `Retention [${task.name}]: deleted=${result.deleted}, cutoff=${result.cutoff}`,
        );
      } catch (error) {
        this.logger.error(`Retention [${task.name}] failed: ${error}`);
      }
    }
  }
}
