import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES, OPERATIONAL_WRITE_ROLES } from '../common/utils/permissions';
import { CreateMaintenanceRuleDto } from './dto/create-maintenance-rule.dto';
import { UpdateMaintenanceRuleDto } from './dto/update-maintenance-rule.dto';
import { FleetMaintenanceService } from './fleet-maintenance.service';

@Controller('fleet/maintenance-rules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FleetMaintenanceController {
  constructor(private readonly maintenance: FleetMaintenanceService) {}

  @Post()
  @RequiresWrite()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  create(@Body() dto: CreateMaintenanceRuleDto) {
    return this.maintenance.createRule(dto);
  }

  @Patch(':id')
  @RequiresWrite()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  update(@Param('id') ruleId: string, @Body() dto: UpdateMaintenanceRuleDto) {
    return this.maintenance.updateRule(ruleId, dto);
  }

  @Post(':id/mark-done')
  @RequiresWrite()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  markDone(@Param('id') ruleId: string) {
    return this.maintenance.markRuleDone(ruleId);
  }

  @Delete(':id')
  @RequiresWrite()
  @Roles(...OPERATIONAL_WRITE_ROLES)
  remove(@Param('id') ruleId: string) {
    return this.maintenance.deleteRule(ruleId);
  }
}

@Controller('fleet/vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FleetVehicleMaintenanceController {
  constructor(private readonly maintenance: FleetMaintenanceService) {}

  @Get(':vehicleId/maintenance')
  list(@Param('vehicleId') vehicleId: string) {
    return this.maintenance.listVehicleMaintenance(vehicleId);
  }

  @Get(':vehicleId/costs')
  costs(
    @Param('vehicleId') vehicleId: string,
    @Query('months') months?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    if (!tenantId) {
      throw new BadRequestException('tenantId missing in auth context');
    }
    const parsedMonths = months ? Number(months) : 6;
    return this.maintenance.getVehicleCosts(
      tenantId,
      vehicleId,
      Number.isFinite(parsedMonths) ? parsedMonths : 6,
    );
  }
}
