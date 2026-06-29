import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MessengerService as LegacyMessengerService } from '../../messenger/messenger.service';
import type { SendMessageDto } from '../../messenger/dto/send-message.dto';

type MessengerLanguage = SendMessageDto['originalLanguage'];

type ConversationQuery = {
  driverId?: string;
  status?: string;
  search?: string;
  department?: string;
  limit?: string;
};

type SendRequest = {
  conversationId?: string;
  receiverId?: string;
  content?: string;
  text?: string;
  originalLanguage?: string;
  targetLanguage?: string;
  subject?: string;
  department?: string;
};

@Injectable()
export class MessengerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly legacyMessengerService: LegacyMessengerService,
  ) {}

  listConversations(userId: string, query: ConversationQuery) {
    return this.legacyMessengerService.listConversations(userId, query);
  }

  private async resolveDriverId(receiverId: string): Promise<string> {
    const directDriver = await this.prisma.driver.findUnique({
      where: { id: receiverId },
      select: { id: true },
    });

    if (directDriver) {
      return directDriver.id;
    }

    const linkedDriver = await this.prisma.driver.findFirst({
      where: { userId: receiverId },
      select: { id: true },
    });

    if (linkedDriver) {
      return linkedDriver.id;
    }

    throw new NotFoundException('Receiver driver not found');
  }

  async send(userId: string, request: SendRequest) {
    const content = (request.content ?? request.text ?? '').trim();
    if (!content) {
      throw new BadRequestException('content is required');
    }

    const originalLanguage = (request.originalLanguage?.trim() || 'de') as MessengerLanguage;
    const targetLanguage = request.targetLanguage?.trim() as MessengerLanguage | undefined;

    if (request.conversationId?.trim()) {
      return this.legacyMessengerService.sendMessage(userId, request.conversationId.trim(), {
        text: content,
        originalLanguage,
        ...(targetLanguage ? { targetLanguage } : {}),
      });
    }

    if (!request.receiverId?.trim()) {
      throw new BadRequestException('conversationId or receiverId is required');
    }

    const driverId = await this.resolveDriverId(request.receiverId.trim());
    const subject = request.subject?.trim() || 'Direct message';
    const department = request.department?.trim() || 'general';

    const conversation = await this.legacyMessengerService.createConversation(userId, {
      driverId,
      subject,
      department,
    });

    return this.legacyMessengerService.sendMessage(userId, conversation.id, {
      text: content,
      originalLanguage,
      ...(targetLanguage ? { targetLanguage } : {}),
    });
  }
}