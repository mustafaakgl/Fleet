import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'boss')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  listAuditLogs(
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.auditService.listAuditLogs({
      actorUserId,
      action,
      entityType,
      entityId,
      dateFrom,
      dateTo,
    });
  }

  @Get('entity/:entityType/:entityId')
  getEntityAuditLogs(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.auditService.getEntityAuditLogs(entityType, entityId);
  }

  @Get('user/:userId')
  getUserAuditLogs(@Param('userId') userId: string) {
    return this.auditService.getUserAuditLogs(userId);
  }
}
