import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipTenant } from '../tenant/skip-tenant.decorator';
import { SetupTenantDto } from '../onboarding/dto/setup-tenant.dto';
import { FleetOpsGuard } from './fleet-ops.guard';
import { FleetOpsService } from './fleet-ops.service';
import { UpdateTenantStatusDto } from './dto/update-tenant-status.dto';

type FleetOpsRequest = {
  fleetOpsActor?: 'api-key' | 'user';
};

@Controller('fleet-ops')
@SkipTenant()
@UseGuards(FleetOpsGuard)
export class FleetOpsController {
  constructor(private readonly fleetOps: FleetOpsService) {}

  @Get('tenants')
  listTenants() {
    return this.fleetOps.listTenants();
  }

  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  provisionTenant(
    @Body() dto: SetupTenantDto,
    @CurrentUser('id') actorUserId: string | undefined,
    @Req() req: FleetOpsRequest,
  ) {
    const actor = req.fleetOpsActor === 'api-key' ? undefined : actorUserId;
    return this.fleetOps.provisionTenant(dto, actor);
  }

  @Patch('tenants/:id/status')
  updateTenantStatus(
    @Param('id') tenantId: string,
    @Body() dto: UpdateTenantStatusDto,
    @CurrentUser('id') actorUserId: string | undefined,
    @Req() req: FleetOpsRequest,
  ) {
    const actor = req.fleetOpsActor === 'api-key' ? undefined : actorUserId;
    return this.fleetOps.updateTenantStatus(tenantId, dto.status, actor);
  }
}
