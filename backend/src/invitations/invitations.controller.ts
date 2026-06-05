import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InvitationsService } from './invitations.service';

@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get('validate')
  validate(@Query('token') token?: string) {
    return this.invitations.validateToken(token ?? '');
  }

  @Post('accept')
  @HttpCode(HttpStatus.OK)
  accept(@Body() dto: AcceptInvitationDto) {
    return this.invitations.accept(dto.token, dto.password);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ADMIN_ONLY_ROLES)
  list(@CurrentUser('tenantId') tenantId: string | undefined) {
    return this.invitations.list(tenantId ?? '');
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ADMIN_ONLY_ROLES)
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser('tenantId') tenantId: string | undefined,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.create(tenantId, actorUserId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ADMIN_ONLY_ROLES)
  revoke(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | undefined,
    @CurrentUser('id') actorUserId: string,
  ) {
    return this.invitations.revoke(tenantId, id, actorUserId);
  }
}
