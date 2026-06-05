import { Injectable } from '@nestjs/common';
import { isProductionEnv } from '../config/env.validation';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObjectStorageService } from '../storage/object-storage.service';

export type HealthStatus = {
  status: 'ok' | 'degraded' | 'error';
  uptimeSeconds: number;
  timestamp: string;
};

export type ReadinessStatus = HealthStatus & {
  checks: {
    database: 'ok' | 'error';
    smtp: 'ok' | 'error' | 'skipped';
    storage: 'ok' | 'error' | 'skipped';
    sentry: 'ok' | 'skipped';
  };
};

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  getLiveness(): HealthStatus {
    return {
      status: 'ok',
      uptimeSeconds: this.uptimeSeconds(),
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness(): Promise<ReadinessStatus> {
    let database: 'ok' | 'error' = 'error';
    let smtp: 'ok' | 'error' | 'skipped' = 'skipped';
    let storage: 'ok' | 'error' | 'skipped' = 'skipped';
    const sentry: 'ok' | 'skipped' = process.env.SENTRY_DSN?.trim() ? 'ok' : 'skipped';

    try {
      await this.prisma.unscoped.$queryRaw`SELECT 1`;
      database = 'ok';
    } catch {
      database = 'error';
    }

    if (isProductionEnv() && this.mailService.isEnabled()) {
      const verify = await this.mailService.verifyConnection();
      smtp = verify.ok ? 'ok' : 'error';
    }

    if (isProductionEnv() && this.objectStorage.mode === 's3') {
      const verify = await this.objectStorage.verifyConnection();
      storage = verify.ok ? 'ok' : 'error';
    }

    const allOk =
      database === 'ok' &&
      (smtp === 'ok' || smtp === 'skipped') &&
      (storage === 'ok' || storage === 'skipped');

    return {
      status: allOk ? 'ok' : 'degraded',
      uptimeSeconds: this.uptimeSeconds(),
      timestamp: new Date().toISOString(),
      checks: { database, smtp, storage, sentry },
    };
  }

  private uptimeSeconds(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
}
