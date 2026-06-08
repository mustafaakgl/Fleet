import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class DriverBirthdaysScheduler {
  private readonly logger = new Logger(DriverBirthdaysScheduler.name);

  constructor(private readonly queue: QueueService) {}

  /** Daily at 08:00 UTC. Set BIRTHDAY_CRON_ENABLED=false to disable. */
  @Cron('0 8 * * *', { timeZone: 'UTC' })
  async handleDailyBirthdays(): Promise<void> {
    if (process.env.BIRTHDAY_CRON_ENABLED === 'false') {
      return;
    }

    try {
      await this.queue.enqueue('drivers.birthdays');
      this.logger.log(`Birthday job dispatched (${this.queue.mode} mode)`);
    } catch (error) {
      this.logger.error(`Birthday cron failed: ${error}`);
    }
  }
}
