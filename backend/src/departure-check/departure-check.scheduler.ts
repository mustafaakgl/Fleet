import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class DepartureCheckScheduler {
  private readonly logger = new Logger(DepartureCheckScheduler.name);

  constructor(private readonly queue: QueueService) {}

  /** Daily departure-check reminders / defect retention at 06:45 Europe/Berlin */
  @Cron('45 6 * * *', { timeZone: 'Europe/Berlin' })
  async handleDailyDepartureChecks(): Promise<void> {
    if ((process.env.DEPARTURE_CHECK_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      await this.queue.enqueue('departure_checks.daily');
      this.logger.log(`Departure check job dispatched (${this.queue.mode} mode)`);
    } catch (error) {
      this.logger.error(`Departure check cron failed: ${error}`);
    }
  }
}
