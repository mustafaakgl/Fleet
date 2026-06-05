import {
  Controller,
  Get,
  Header,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { isProductionEnv } from '../config/env.validation';
import { SkipTenant } from '../tenant/skip-tenant.decorator';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@Public()
@SkipTenant()
@SkipThrottle()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics(@Headers('authorization') authorization?: string): Promise<string> {
    const token = process.env.METRICS_TOKEN?.trim();
    if (isProductionEnv() && token) {
      const expected = `Bearer ${token}`;
      if (authorization !== expected) {
        throw new UnauthorizedException('Invalid metrics token');
      }
    }

    return this.metrics.metricsText();
  }
}
