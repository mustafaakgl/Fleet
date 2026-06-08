import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class CompanyEmailsScheduler {
  private readonly logger = new Logger(CompanyEmailsScheduler.name);

  constructor(private readonly queue: QueueService) {}

  /** Generate and optionally send tomorrow's company Einsatzplan emails at 18:00 Europe/Berlin */
  @Cron('0 18 * * *', { timeZone: 'Europe/Berlin' })
  async handleTomorrowCompanyEmails(): Promise<void> {
    if ((process.env.COMPANY_EMAIL_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().slice(0, 10);

    try {
      await this.queue.enqueue('company_emails.tomorrow', { date });
      this.logger.log(`Tomorrow company email job dispatched for ${date} (${this.queue.mode} mode)`);
    } catch (error) {
      this.logger.error(`Tomorrow company email cron failed: ${error}`);
    }
  }
}
