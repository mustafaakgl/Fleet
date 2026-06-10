import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { VehicleCategory } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { ChecklistTemplatesService } from './checklist-templates.service';
import { CreateChecklistTemplateDto } from './dto/create-checklist-template.dto';
import { UpdateChecklistTemplateDto } from './dto/update-checklist-template.dto';

@Controller('checklist-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class ChecklistTemplatesController {
  constructor(private readonly templates: ChecklistTemplatesService) {}

  @Get()
  list(
    @CurrentUser('tenantId') tenantId: string | undefined,
    @Query('vehicle_category') vehicleCategory?: VehicleCategory,
    @Query('active_only') activeOnly?: string,
  ) {
    return this.templates.list(tenantId ?? 'default-tenant', {
      vehicle_category: vehicleCategory,
      active_only: activeOnly !== 'false',
    });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.templates.getById(id);
  }

  @Post()
  @RequiresWrite()
  create(
    @CurrentUser('tenantId') tenantId: string | undefined,
    @Body() dto: CreateChecklistTemplateDto,
  ) {
    return this.templates.create(tenantId ?? 'default-tenant', dto);
  }

  @Patch(':id')
  @RequiresWrite()
  update(@Param('id') id: string, @Body() dto: UpdateChecklistTemplateDto) {
    return this.templates.update(id, dto);
  }
}
