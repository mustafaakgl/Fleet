import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { MessengerService } from './messenger.service';

class SendMessengerRequestDto {
  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsString()
  receiverId?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  originalLanguage?: string;

  @IsOptional()
  @IsString()
  targetLanguage?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  department?: string;
}

@Controller('messenger')
@UseGuards(JwtAuthGuard)
export class MessengerController {
  constructor(private readonly messengerService: MessengerService) {}

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

  @Post('send')
  send(@CurrentUser('id') userId: string, @Body() body: SendMessengerRequestDto) {
    return this.messengerService.send(userId, body);
  }
}