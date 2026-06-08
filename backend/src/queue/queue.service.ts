import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';

export type JobHandler = (payload: unknown) => Promise<void>;

const KNOWN_JOBS = [
  'reminders.generate',
  'privacy.retention',
  'drivers.birthdays',
] as const;

export type KnownJobName = (typeof KNOWN_JOBS)[number];

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly handlers = new Map<string, JobHandler>();
  private queue?: Queue;
  private worker?: Worker;

  private get redisUrl(): string | undefined {
    return process.env.REDIS_URL?.trim() || undefined;
  }

  get mode(): 'redis' | 'inline' {
    return this.redisUrl ? 'redis' : 'inline';
  }

  registerHandler(name: KnownJobName, handler: JobHandler): void {
    this.handlers.set(name, handler);
  }

  onModuleInit(): void {
    if (!this.redisUrl) {
      this.logger.log('REDIS_URL not set — background jobs run inline when enqueued.');
      return;
    }

    const connection = { url: this.redisUrl, maxRetriesPerRequest: null };
    this.queue = new Queue('fleet-jobs', { connection });

    this.worker = new Worker(
      'fleet-jobs',
      async (job: Job) => {
        const handler = this.handlers.get(job.name);
        if (!handler) {
          throw new Error(`No handler registered for job: ${job.name}`);
        }
        await handler(job.data);
      },
      { connection },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.name ?? 'unknown'} failed: ${error}`);
    });

    this.logger.log('BullMQ worker started (REDIS_URL configured).');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
  }

  async enqueue(name: KnownJobName, payload: Record<string, unknown> = {}): Promise<void> {
    const handler = this.handlers.get(name);
    if (!handler) {
      throw new Error(`No handler registered for job: ${name}`);
    }

    if (this.queue) {
      await this.queue.add(name, payload, {
        jobId: `${name}:${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 50,
      });
      return;
    }

    await handler(payload);
  }
}
