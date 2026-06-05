import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrivacyService } from './privacy.service';

@Injectable()
export class PrivacyRetentionJob {
  private readonly logger = new Logger(PrivacyRetentionJob.name);

  constructor(private readonly privacyService: PrivacyService) {}

  /** Daily at 03:00 Europe/Berlin. Set RETENTION_CRON_ENABLED=false to disable. */
  @Cron('0 3 * * *', { timeZone: 'Europe/Berlin' })
  async purgeLocationHistory(): Promise<void> {
    if (process.env.RETENTION_CRON_ENABLED === 'false') {
      return;
    }

    try {
      const result = await this.privacyService.purgeOldLocationHistory();
      this.logger.log(
        `Retention purge finished: deleted=${result.deleted}, cutoff=${result.cutoff}`,
      );
    } catch (error) {
      this.logger.error(`Retention purge failed: ${error}`);
    }
  }
}
