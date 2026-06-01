import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { MessengerService } from './messenger.service';

@Controller('messenger')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'boss', 'accounting', 'office', 'driver')
export class MessengerController {
  constructor(private readonly messengerService: MessengerService) {}

  @Get('conversations')
  listConversations(
    @CurrentUser('id') userId: string,
    @Query('driverId') driverId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.messengerService.listConversations(userId, { driverId, status, search });
  }

  @Post('conversations')
  createConversation(@CurrentUser('id') userId: string, @Body() dto: CreateConversationDto) {
    return this.messengerService.createConversation(userId, dto);
  }

  @Get('conversations/:id')
  getConversationDetail(@CurrentUser('id') userId: string, @Param('id') conversationId: string) {
    return this.messengerService.getConversationDetail(userId, conversationId);
  }

  @Get('conversations/:id/messages')
  listMessages(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Query('since') since?: string,
    @Query('afterId') afterId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messengerService.listMessages(userId, conversationId, { since, afterId, limit });
  }

  @Post('conversations/:id/messages')
  sendMessage(
    @CurrentUser('id') userId: string,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messengerService.sendMessage(userId, conversationId, dto);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  markConversationRead(@CurrentUser('id') userId: string, @Param('id') conversationId: string) {
    return this.messengerService.markConversationRead(userId, conversationId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser('id') userId: string) {
    return this.messengerService.unreadCount(userId);
  }
}
