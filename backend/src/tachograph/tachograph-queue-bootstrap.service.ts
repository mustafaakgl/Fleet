import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DddFileProcessingStatus } from '@prisma/client';
import { TachographQueueService } from './tachograph-queue.service';
import { TachographService } from './tachograph.service';
import type { DddProcessJobPayload } from './tachograph-queue.types';

@Injectable()
export class TachographQueueBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(TachographQueueBootstrapService.name);

  constructor(
    private readonly queue: TachographQueueService,
    private readonly tachograph: TachographService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler('tachograph.ddd.process', async (payload) => {
      const job = payload as DddProcessJobPayload;
      await this.tachograph.processDddFile(job.tenantId, job.dddFileId);
    });

    this.queue.registerPermanentFailureHandler('tachograph.ddd.process', async (payload, error) => {
      const job = payload as DddProcessJobPayload;
      const summary = error instanceof Error ? error.message : String(error);
      try {
        await this.prisma.dddFile.update({
          where: { id: job.dddFileId },
          data: {
            status: DddFileProcessingStatus.failed,
            processingErrorSummary: summary.slice(0, 500),
          },
        });
      } catch (updateError) {
        const message = updateError instanceof Error ? updateError.message : String(updateError);
        this.logger.error(`Failed to mark DDD file ${job.dddFileId} as failed: ${message}`);
      }
    });

    this.logger.log(`Tachograph queue mode: ${this.queue.mode}`);
  }
}
