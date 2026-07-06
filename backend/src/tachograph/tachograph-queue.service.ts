import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { MetricsService } from '../metrics/metrics.service';
import {
  DddProcessJobPayload,
  TachographJobHandler,
  TachographJobName,
  TachographPermanentFailureHandler,
} from './tachograph-queue.types';

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500;

@Injectable()
export class TachographQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TachographQueueService.name);
  private readonly handlers = new Map<string, TachographJobHandler>();
  private readonly permanentFailureHandlers = new Map<
    string,
    TachographPermanentFailureHandler
  >();
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly metrics: MetricsService) {}

  private get redisUrl(): string | undefined {
    return process.env.REDIS_URL?.trim() || undefined;
  }

  get mode(): 'redis' | 'inline' {
    return this.redisUrl ? 'redis' : 'inline';
  }

  registerHandler(name: TachographJobName, handler: TachographJobHandler): void {
    this.handlers.set(name, handler);
  }

  registerPermanentFailureHandler(
    name: TachographJobName,
    handler: TachographPermanentFailureHandler,
  ): void {
    this.permanentFailureHandlers.set(name, handler);
  }

  onModuleInit(): void {
    if (!this.redisUrl) {
      this.logger.log('REDIS_URL not set — tachograph DDD jobs run inline when enqueued.');
      return;
    }

    const connection = { url: this.redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue('fleet-tachograph', { connection });

    this.worker = new Worker(
      'fleet-tachograph',
      async (job: Job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) {
          throw new Error(`No tachograph handler registered for job: ${job.name}`);
        }
        await handler(job.data);
      },
      { connection },
    );

    this.worker.on('failed', (job, error) => {
      const name = job?.name ?? 'unknown';
      this.logger.error(`Tachograph job ${name} failed: ${error}`);
      if (job && (job.attemptsMade ?? 0) >= (job.opts.attempts ?? MAX_ATTEMPTS)) {
        void this.runPermanentFailureHandler(job.name, job.data, error);
      }
    });

    this.logger.log('BullMQ tachograph worker started.');
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

  async enqueueDddProcess(payload: DddProcessJobPayload): Promise<void> {
    await this.enqueue('tachograph.ddd.process', payload);
  }

  private async enqueue(
    name: TachographJobName,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No tachograph handler registered for job: ${name}`);
    }

    if (this.queue) {
      const started = Date.now();
      await this.queue.add(name, payload, {
        jobId: `${name}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        attempts: MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: BASE_BACKOFF_MS },
        removeOnComplete: 500,
        removeOnFail: 200,
      });
      this.metrics.tachographAckLatencyMs.observe(Date.now() - started);
      void this.refreshQueueDepthMetric();
      return;
    }

    await this.runInlineWithRetry(name, handler, payload);
  }

  private async runInlineWithRetry(
    name: TachographJobName,
    handler: TachographJobHandler,
    payload: Record<string, unknown>,
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        await handler(payload);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS) {
          await this.delay(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        }
      }
    }

    await this.runPermanentFailureHandler(name, payload, lastError);
    throw lastError;
  }

  private async runPermanentFailureHandler(
    name: string,
    payload: unknown,
    error: unknown,
  ): Promise<void> {
    const handler = this.permanentFailureHandlers.get(name);
    if (!handler) {
      return;
    }
    try {
      await handler(payload, error);
    } catch (handlerError) {
      const message =
        handlerError instanceof Error ? handlerError.message : String(handlerError);
      this.logger.error(`Tachograph permanent-failure handler for ${name} threw: ${message}`);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  private async refreshQueueDepthMetric(): Promise<void> {
    try {
      const depth = await this.getQueueDepth();
      this.metrics.tachographQueueDepth.set(depth);
    } catch {
      // best-effort gauge
    }
  }
}
