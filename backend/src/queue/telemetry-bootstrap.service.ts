import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TelemetryIngestService } from './telemetry-ingest.service';
import { TelemetryQuarantineService } from './telemetry-quarantine.service';
import { TelemetryQueueService } from './telemetry-queue.service';
import { TelematicsAlarmService } from './telematics-alarm.service';
import type { TelemetryIngestJobPayload, TelemetryQuarantineJobPayload } from './telemetry.types';

@Injectable()
export class TelemetryBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(TelemetryBootstrapService.name);

  constructor(
    private readonly queue: TelemetryQueueService,
    private readonly ingest: TelemetryIngestService,
    private readonly quarantine: TelemetryQuarantineService,
    private readonly alarms: TelematicsAlarmService,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler('telemetry.ingest', async (payload) => {
      await this.ingest.processIngestJob(payload as TelemetryIngestJobPayload);
    });

    this.queue.registerHandler('telemetry.quarantine', async (payload) => {
      await this.quarantine.processQuarantineJob(payload as TelemetryQuarantineJobPayload);
    });

    this.logger.log(`Telemetry queue mode: ${this.queue.mode}`);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runDeviceSilentWatchdog(): Promise<void> {
    try {
      await this.alarms.runDeviceSilentWatchdog();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`device silent watchdog failed: ${message}`);
    }
  }
}
