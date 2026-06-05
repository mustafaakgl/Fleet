import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { SkipTenant } from '../tenant/skip-tenant.decorator';
import { HealthService } from './health.service';

@Controller('health')
@Public()
@SkipTenant()
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  liveness() {
    return this.health.getLiveness();
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async readiness() {
    return this.health.getReadiness();
  }
}
