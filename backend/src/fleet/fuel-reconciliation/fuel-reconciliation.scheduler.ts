import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { FUEL_LEVEL_SAMPLE_CAPTURE } from './core/fuel-reconciliation-config';
import { FuelReconciliationService } from './fuel-reconciliation.service';

/**
 * Bekleyen analizlerin islenme sikligi.
 *
 * Uretimde bes dakika fazlasiyla yeterli: analiz bir fisin onayindan sonra
 * calisan bir kontrol, kimse ekranda beklemiyor. Yapilandirilabilir olmasinin
 * tek nedeni UCTAN UCA TESTLER: orada bes dakika beklemek, testi ya cok yavas
 * ya da atlanmis yapardi. Ifade MODUL YUKLENIRKEN okunuyor (dekorator
 * boyle calisiyor), yani surec icinde degistirilemez.
 */
const PENDING_CRON = process.env.FUEL_RECONCILIATION_CRON_EXPRESSION?.trim()
  || '*/5 * * * *';

/**
 * Mutabakat worker'i.
 *
 * NEDEN SCHEDULER, NEDEN KUYRUK DEGIL: repodaki BullMQ altyapisi telematik
 * yutma hattina ozel ve Redis'e bagli. Analizin dayanikliligi zaten
 * VERITABANINDA: onay transaction'i `pending` bir satir yaziyor. Redis
 * duserse is kaybolmuyor, yalnizca beklemeye devam ediyor. Ayni garantiyi
 * ikinci bir altyapiyla tekrar kurmanin karsiligi yoktu.
 */
@Injectable()
export class FuelReconciliationScheduler {
  private readonly logger = new Logger(FuelReconciliationScheduler.name);

  constructor(private readonly reconciliation: FuelReconciliationService) {}

  private get enabled(): boolean {
    return (process.env.FUEL_RECONCILIATION_CRON_ENABLED ?? 'true').toLowerCase() !== 'false';
  }

  /** Bekleyen analizler. */
  @Cron(PENDING_CRON)
  async handlePending(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      const result = await this.reconciliation.processPending();
      if (result.processed > 0 || result.failed > 0) {
        this.logger.log(
          `Fuel reconciliation: processed=${result.processed} failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(`Fuel reconciliation cron failed: ${error}`);
    }
  }

  /**
   * Gec gelen telematik verisi icin yeniden hesaplama.
   *
   * Bekleyenlerden DAHA SEYREK: bu tur bir gecikme dakikalar degil saatler
   * olcusunde yasaniyor ve her yarim saatte butun acik kayitlari yeniden
   * hesaplamanin karsiligi yok.
   */
  @Cron('7 * * * *')
  async handleRecalculation(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      const result = await this.reconciliation.recalculateOpen();
      if (result.changed > 0) {
        this.logger.log(
          `Fuel reconciliation recalculation: rows=${result.recalculated} changed=${result.changed}`,
        );
      }
    } catch (error) {
      this.logger.error(`Fuel reconciliation recalculation cron failed: ${error}`);
    }
  }

  /** Yakit seviyesi orneklerinin saklama suresi temizligi. */
  @Cron('23 3 * * *')
  async handleSampleRetention(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      const deleted = await this.reconciliation.purgeExpiredFuelLevelSamples(
        FUEL_LEVEL_SAMPLE_CAPTURE.retentionDays,
      );
      if (deleted > 0) {
        this.logger.log(`Fuel level samples purged: ${deleted}`);
      }
    } catch (error) {
      this.logger.error(`Fuel level sample retention cron failed: ${error}`);
    }
  }
}
