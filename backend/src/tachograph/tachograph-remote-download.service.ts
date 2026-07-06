import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DddFileSource } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { TachographQueueService } from './tachograph-queue.service';
import { TachographService } from './tachograph.service';
import { DDD_REMOTE_DOWNLOAD_PORT, DddRemoteDownloadPort, DddRemoteDownloadSchedule } from './remote-download/ddd-remote-download.port';

const MAX_ERROR_SUMMARY_LENGTH = 500;

@Injectable()
export class TachographRemoteDownloadService {
  private readonly logger = new Logger(TachographRemoteDownloadService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(DDD_REMOTE_DOWNLOAD_PORT) private readonly remoteDownload: DddRemoteDownloadPort,
    private readonly tachograph: TachographService,
    private readonly queue: TachographQueueService,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runRemoteDownloadSweep(): Promise<void> {
    try {
      await this.processDueSchedules();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`remote DDD download sweep failed: ${message}`);
    }
  }

  async processDueSchedules(now = new Date()): Promise<void> {
    const schedules = await this.prisma.tachoDownloadSchedule.findMany({
      where: {
        enabled: true,
        nextDueAt: { lte: now },
      },
      orderBy: { nextDueAt: 'asc' },
    });

    for (const schedule of schedules) {
      await this.processSchedule(schedule, now);
    }
  }

  private async processSchedule(schedule: DddRemoteDownloadSchedule, now: Date): Promise<void> {
    try {
      const references = await this.remoteDownload.listAvailableFiles(schedule);
      let processedCount = 0;

      for (const reference of references) {
        const buffer = await this.remoteDownload.downloadFile(reference);
        const result = await this.tachograph.enqueueDddFile(buffer, {
          tenantId: reference.tenantId,
          vehicleId: reference.vehicleId ?? undefined,
          fileName: reference.fileName,
          capturedAt: reference.capturedAt,
          source: DddFileSource.remote,
        });

        if (!result.deduplicated) {
          await this.queue.enqueueDddProcess({
            tenantId: reference.tenantId,
            dddFileId: result.file.id,
          });
        }

        processedCount += 1;
      }

      await this.prisma.tachoDownloadSchedule.update({
        where: { id: schedule.id },
        data: {
          lastAttemptAt: now,
          lastError: null,
          consecutiveFailureCount: 0,
        },
      });

      this.logger.log(
        `Remote DDD schedule ${schedule.id} processed: ${processedCount} files`,
      );
    } catch (error) {
      try {
        await this.recordScheduleFailure(schedule, error, now);
      } catch (failureError) {
        const message = failureError instanceof Error ? failureError.message : String(failureError);
        this.logger.warn(`failed to persist remote DDD schedule error for ${schedule.id}: ${message}`);
      }
    }
  }

  private async recordScheduleFailure(
    schedule: DddRemoteDownloadSchedule,
    error: unknown,
    now: Date,
  ): Promise<void> {
    const summary = this.summarizeError(error);
    const nextCount = await this.incrementFailureCount(schedule.id, summary, now);

    if (nextCount === 3) {
      try {
        await this.notifications.notifyAdminsAndOffice({
          title: 'TIS-Web remote DDD download failed',
          message: `${schedule.subject} schedule ${schedule.id} failed 3 times: ${summary}`,
          type: 'system',
          priority: 'high',
          relatedEntityType: 'TachoDownloadSchedule',
          relatedEntityId: schedule.id,
        });
      } catch (notificationError) {
        const message = notificationError instanceof Error ? notificationError.message : String(notificationError);
        this.logger.warn(`remote DDD failure notification failed for ${schedule.id}: ${message}`);
      }
    }

    this.logger.warn(`Remote DDD schedule ${schedule.id} failed: ${summary}`);
  }

  private async incrementFailureCount(scheduleId: string, summary: string, now: Date): Promise<number> {
    const schedule = await this.prisma.tachoDownloadSchedule.update({
      where: { id: scheduleId },
      data: {
        lastAttemptAt: now,
        lastError: summary,
        consecutiveFailureCount: { increment: 1 },
      },
      select: { consecutiveFailureCount: true },
    });

    return schedule.consecutiveFailureCount;
  }

  private summarizeError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, MAX_ERROR_SUMMARY_LENGTH);
  }
}
