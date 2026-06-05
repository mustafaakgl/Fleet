import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { BillingService } from './billing.service';
import { CreateManualBillingDto } from './dto/create-manual-billing.dto';
import { StartCheckoutDto } from './dto/start-checkout.dto';

@Controller('billing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ADMIN_ONLY_ROLES)
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  getPlans() {
    return this.billing.getPlans();
  }

  @Get('status')
  getStatus(@CurrentUser('tenantId') tenantId: string | undefined) {
    return this.billing.getStatus(tenantId);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  startCheckout(
    @CurrentUser('tenantId') tenantId: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: StartCheckoutDto,
  ) {
    return this.billing.startCheckout(tenantId, actorUserId, dto);
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  openPortal(
    @CurrentUser('tenantId') tenantId: string | undefined,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.billing.createPortalSession(tenantId, actorUserId);
  }

  @Post('manual')
  @HttpCode(HttpStatus.OK)
  setManualBilling(
    @CurrentUser('id') actorUserId: string,
    @Body() dto: CreateManualBillingDto,
  ) {
    return this.billing.setManualBilling(actorUserId, dto);
  }
}
