import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { MetricsService } from '../metrics/metrics.service';
import type {
  TelemetryIngestJobPayload,
  TelemetryQuarantineJobPayload,
} from './telemetry.types';

export type TelemetryJobHandler = (payload: unknown) => Promise<void>;

const TELEMETRY_JOBS = ['telemetry.ingest', 'telemetry.quarantine'] as const;
export type TelemetryJobName = (typeof TELEMETRY_JOBS)[number];

@Injectable()
export class TelemetryQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelemetryQueueService.name);
  private readonly handlers = new Map<string, TelemetryJobHandler>();
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly metrics: MetricsService) {}

  private get redisUrl(): string | undefined {
    return process.env.REDIS_URL?.trim() || undefined;
  }

  get mode(): 'redis' | 'inline' {
    return this.redisUrl ? 'redis' : 'inline';
  }

  registerHandler(name: TelemetryJobName, handler: TelemetryJobHandler): void {
    this.handlers.set(name, handler);
  }

  onModuleInit(): void {
    if (!this.redisUrl) {
      this.logger.log('REDIS_URL not set — telemetry jobs run inline when enqueued.');
      return;
    }

    const connection = { url: this.redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue('fleet-telemetry', { connection });

    this.worker = new Worker(
      'fleet-telemetry',
      async (job: Job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) {
          throw new Error(`No telemetry handler registered for job: ${job.name}`);
        }
        await handler(job.data);
      },
      { connection },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Telemetry job ${job?.name ?? 'unknown'} failed: ${error}`);
    });

    this.logger.log('BullMQ telemetry worker started.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async getQueueDepth(): Promise<number> {
    if (!this.queue) {
      return 0;
    }
    const counts = await this.queue.getJobCounts('waiting', 'active', 'delayed');
    return counts.waiting + counts.active + counts.delayed;
  }

  async enqueueIngest(payload: TelemetryIngestJobPayload): Promise<void> {
    await this.enqueue('telemetry.ingest', payload);
  }

  async enqueueQuarantine(payload: TelemetryQuarantineJobPayload): Promise<void> {
    this.metrics.telematicsQuarantinedTotal.inc();
    await this.enqueue('telemetry.quarantine', payload);
  }

  private async enqueue(name: TelemetryJobName, payload: Record<string, unknown>): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No telemetry handler registered for job: ${name}`);
    }

    if (this.queue) {
      const started = Date.now();
      await this.queue.add(name, payload, {
        jobId: `${name}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        removeOnComplete: 500,
        removeOnFail: 200,
      });
      this.metrics.telematicsAckLatencyMs.observe(Date.now() - started);
      void this.refreshQueueDepthMetric();
      return;
    }

    await handler(payload);
  }

  private async refreshQueueDepthMetric(): Promise<void> {
    try {
      const depth = await this.getQueueDepth();
      this.metrics.telematicsQueueDepth.set(depth);
    } catch {
      // best-effort gauge
    }
  }
}
