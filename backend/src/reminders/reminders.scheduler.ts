import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class RemindersScheduler {
  private readonly logger = new Logger(RemindersScheduler.name);

  constructor(private readonly queue: QueueService) {}

  /** Daily compliance reminders at 06:00 Europe/Berlin */
  @Cron('0 6 * * *', { timeZone: 'Europe/Berlin' })
  async handleDailyComplianceReminders(): Promise<void> {
    if ((process.env.REMINDER_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      await this.queue.enqueue('reminders.generate');
      this.logger.log(`Compliance reminder job dispatched (${this.queue.mode} mode)`);
    } catch (error) {
      this.logger.error(`Compliance reminder cron failed: ${error}`);
    }
  }
}
