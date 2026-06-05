import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { SetupTenantDto } from './dto/setup-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('status')
  getStatus() {
    return this.onboarding.getStatus();
  }

  @Post('setup')
  @HttpCode(HttpStatus.CREATED)
  setup(@Body() dto: SetupTenantDto) {
    return this.onboarding.setup(dto);
  }

  @Get('tenant')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ADMIN_ONLY_ROLES)
  getTenant(@CurrentUser('tenantId') tenantId: string | undefined) {
    return this.onboarding.getTenantForAdmin(tenantId);
  }

  @Patch('tenant')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ADMIN_ONLY_ROLES)
  updateTenant(
    @CurrentUser('tenantId') tenantId: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: UpdateTenantDto,
  ) {
    if (!tenantId) {
      return this.onboarding.getTenantForAdmin(tenantId);
    }
    return this.onboarding.updateTenant(tenantId, dto, actorUserId);
  }
}
