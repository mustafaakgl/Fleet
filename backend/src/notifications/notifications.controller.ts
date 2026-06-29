import { Controller, Get, Header, Param, Patch, Post, Query, Sse, UseGuards } from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { NotificationSseService } from './notification-sse.service';
import { NotificationsService } from './notifications.service';
import type { UserRole } from '@prisma/client';

@Controller('notifications')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly sse: NotificationSseService,
  ) {}

  @Sse('stream')
  @Header('Cache-Control', 'no-cache')
  @Header('X-Accel-Buffering', 'no')
  stream(@CurrentUser('id') userId: string): Observable<MessageEvent> {
    return this.sse.subscribe(userId);
  }

  @Get()
  listMyNotifications(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
    @Query('status') status?: string,
  ) {
    return this.notificationsService.listNotificationsForRole(role, userId, status);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole) {
    return this.notificationsService.getUnreadCountForRole(role, userId);
  }

  @Patch(':id')
  markAsRead(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    return this.notificationsService.markAsReadForRole(id, userId, role);
  }

  @Post(':id/read')
  markAsReadLegacy(@Param('id') id: string, @CurrentUser('id') userId: string, @CurrentUser('role') role: UserRole) {
    return this.notificationsService.markAsReadForRole(id, userId, role);
  }

  @Post('read-all')
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }
}
