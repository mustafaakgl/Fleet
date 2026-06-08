import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class PrivacyRetentionJob {
  private readonly logger = new Logger(PrivacyRetentionJob.name);

  constructor(private readonly queue: QueueService) {}

  /** Daily at 03:00 Europe/Berlin. Set RETENTION_CRON_ENABLED=false to disable. */
  @Cron('0 3 * * *', { timeZone: 'Europe/Berlin' })
  async runDailyRetention(): Promise<void> {
    if (process.env.RETENTION_CRON_ENABLED === 'false') {
      return;
    }

    try {
      await this.queue.enqueue('privacy.retention');
      this.logger.log(`Retention job dispatched (${this.queue.mode} mode)`);
    } catch (error) {
      this.logger.error(`Retention cron failed: ${error}`);
    }
  }
}
