import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AutomationJobService } from './automation-job.service';
import { AutomationProposalService } from './automation-proposal.service';
import { isOrdivanEnabled, resolveOrdivanMode } from './ordivan.config';

/**
 * Suresi dolmus kiralamalari toparlar.
 *
 * Connector cokup hic haber vermezse isi kurtaran TEK yol budur. Deneme
 * siniri dolmussa is kuyruga degil dead-letter'a duser: sonsuz tekrar, bozuk
 * bir isin butun kuyrugu tuketmesi demektir.
 */
@Injectable()
export class OrdivanScheduler {
  private readonly logger = new Logger(OrdivanScheduler.name);

  constructor(
    private readonly jobs: AutomationJobService,
    private readonly proposals: AutomationProposalService,
  ) {}

  @Cron('*/1 * * * *')
  async reclaimExpiredLeases(): Promise<void> {
    if (!isOrdivanEnabled(resolveOrdivanMode())) {
      return;
    }
    if ((process.env.ORDIVAN_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      const result = await this.jobs.reclaimExpiredLeases();
      if (result.requeued > 0 || result.deadLettered > 0) {
        this.logger.log(
          `Ordivan lease reclaim: requeued=${result.requeued} deadLettered=${result.deadLettered}`,
        );
      }
    } catch (error) {
      this.logger.error(`Ordivan lease reclaim failed: ${error}`);
    }
  }

  /**
   * Suresi dolmus onerileri kapatir.
   *
   * Kiralama toparlamasindan DAHA SEYREK: oneri suresi gunler olcusunde,
   * dakikada bir taramanin karsiligi yok.
   */
  @Cron('11 * * * *')
  async expireOverdueProposals(): Promise<void> {
    if (!isOrdivanEnabled(resolveOrdivanMode())) {
      return;
    }
    if ((process.env.ORDIVAN_CRON_ENABLED ?? 'true').toLowerCase() === 'false') {
      return;
    }

    try {
      const result = await this.proposals.expireOverdueProposals();
      if (result.expired > 0) {
        this.logger.log(`Ordivan proposals expired: ${result.expired}`);
      }
    } catch (error) {
      this.logger.error(`Ordivan proposal expiry failed: ${error}`);
    }
  }
}
