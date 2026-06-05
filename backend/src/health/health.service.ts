import { Injectable } from '@nestjs/common';
import { isProductionEnv } from '../config/env.validation';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

export type HealthStatus = {
  status: 'ok' | 'degraded' | 'error';
  uptimeSeconds: number;
  timestamp: string;
};

export type ReadinessStatus = HealthStatus & {
  checks: {
    database: 'ok' | 'error';
    smtp: 'ok' | 'error' | 'skipped';
  };
};

@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
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

    const allOk = database === 'ok' && (smtp === 'ok' || smtp === 'skipped');

    return {
      status: allOk ? 'ok' : 'degraded',
      uptimeSeconds: this.uptimeSeconds(),
      timestamp: new Date().toISOString(),
      checks: { database, smtp },
    };
  }

  private uptimeSeconds(): number {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }
}
