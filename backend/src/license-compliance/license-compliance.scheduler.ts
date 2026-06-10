import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class LicenseComplianceScheduler {
  private readonly logger = new Logger(LicenseComplianceScheduler.name);

  constructor(private readonly queue: QueueService) {}

  /** Daily license compliance jobs at 06:30 Europe/Berlin */
  @Cron('30 6 * * *', { timeZone: 'Europe/Berlin' })
  async handleDailyLicenseCompliance(): Promise<void> {
    if ((process.env.LICENSE_CHECK_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      await this.queue.enqueue('license_checks.daily');
      this.logger.log(`License compliance job dispatched (${this.queue.mode} mode)`);
    } catch (error) {
      this.logger.error(`License compliance cron failed: ${error}`);
    }
  }
}
