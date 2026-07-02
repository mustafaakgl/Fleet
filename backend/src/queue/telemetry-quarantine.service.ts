import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { TelemetryQuarantineJobPayload } from './telemetry.types';

@Injectable()
export class TelemetryQuarantineService {
  constructor(private readonly prisma: PrismaService) {}

  async processQuarantineJob(payload: TelemetryQuarantineJobPayload): Promise<void> {
    await this.prisma.unscoped.telemetryQuarantine.create({
      data: {
        tenantId: payload.tenantId ?? null,
        imei: payload.imei ?? null,
        rawHex: payload.rawHex,
        error: payload.error,
      },
    });
  }
}
