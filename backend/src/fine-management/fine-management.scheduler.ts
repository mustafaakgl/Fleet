import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class FineManagementScheduler {
  private readonly logger = new Logger(FineManagementScheduler.name);

  constructor(private readonly queue: QueueService) {}

  /** Daily fine reminders at 07:00 Europe/Berlin */
  @Cron('0 7 * * *', { timeZone: 'Europe/Berlin' })
  async handleDailyFineJobs(): Promise<void> {
    if ((process.env.FINE_MANAGEMENT_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      await this.queue.enqueue('fines.daily');
      this.logger.log(`Fine management job dispatched (${this.queue.mode} mode)`);
    } catch (error) {
      this.logger.error(`Fine management cron failed: ${error}`);
    }
  }
}
