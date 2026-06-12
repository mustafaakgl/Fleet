import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
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

  @Get('stream')
  async stream(
    @CurrentUser('id') userId: string,
    @Query('search') search: string | undefined,
    @Query('department') department: string | undefined,
    @Query('conversationId') conversationId: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let cursor: { id: string; createdAt: string } | null = null;
    const pollMs = 10_000;

    const sendSnapshot = async () => {
      try {
        const [conversations, unread, stats] = await Promise.all([
          this.messengerService.listConversations(userId, {
            search,
            department,
            limit: '100',
          }),
          this.messengerService.unreadCount(userId),
          this.messengerService.getStats(userId, { search, department }),
        ]);

        let messages: Awaited<ReturnType<MessengerService['listMessages']>> = [];
        if (conversationId) {
          messages = await this.messengerService.listMessages(userId, conversationId, {
            since: cursor?.createdAt,
            afterId: cursor?.id,
            limit: '50',
          });
          const last = messages[messages.length - 1];
          if (last) {
            cursor = { id: last.id, createdAt: last.createdAt };
          }
        }

        res.write(
          `event: messenger\ndata:${JSON.stringify({ conversations, unread, stats, messages })}\n\n`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'messenger_stream_failed';
        res.write(`event: error\ndata:${JSON.stringify({ message })}\n\n`);
      }
    };

    void sendSnapshot();
    const interval = setInterval(() => {
      void sendSnapshot();
    }, pollMs);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  }

  @Get('stats')
  getStats(
    @CurrentUser('id') userId: string,
    @Query('search') search?: string,
    @Query('department') department?: string,
  ) {
    return this.messengerService.getStats(userId, { search, department });
  }

  @Get('conversations/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="messenger-conversations.csv"')
  exportConversations(
    @CurrentUser('id') userId: string,
    @Query('driverId') driverId?: string,
    @Query('search') search?: string,
    @Query('department') department?: string,
  ) {
    return this.messengerService.exportConversationsCsv(userId, { driverId, search, department });
  }

  @Get('conversations')
  listConversations(
    @CurrentUser('id') userId: string,
    @Query('driverId') driverId?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('department') department?: string,
    @Query('limit') limit?: string,
  ) {
    return this.messengerService.listConversations(userId, {
      driverId,
      status,
      search,
      department,
      limit,
    });
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
