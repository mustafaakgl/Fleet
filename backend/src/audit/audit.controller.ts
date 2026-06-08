import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
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
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.listAuditLogs({
      actorUserId,
      action,
      entityType,
      entityId,
      dateFrom,
      dateTo,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-logs.csv"')
  exportAuditLogs(
    @Query('actorUserId') actorUserId?: string,
    @Query('action') action?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.auditService.exportAuditLogsCsv({
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
