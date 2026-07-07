import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MessageTranslationStatus, Prisma, type UserRole } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { DriverNotifyService } from '../notifications/driver-notify.service';
import { ObjectStorageService } from '../storage/object-storage.service';
import { uploadAbsoluteDirForBucket } from '../storage/local-storage.service';
import { StorageService } from '../storage/storage.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import {
  assertMessengerAttachmentsInput,
  buildStoredAttachmentFileName,
  sanitizeAttachmentBuffer,
  sanitizeAttachmentFileName,
} from './messenger-attachments.util';
import { SendMessageDto } from './dto/send-message.dto';
import {
  allowedDepartmentsForRole,
  canAccessDepartment,
  normalizeDriverConversationDepartment,
  normalizeMessengerDepartment,
} from './messenger-departments.util';
import { buildMessengerConversationsCsv } from './messenger-export.util';
import { MessengerViewerTranslationService } from './messenger-viewer-translation.service';

type MessengerUser = {
  id: string;
  role: UserRole;
  fullName: string;
  language: string | null;
};

type ConversationListQuery = {
  driverId?: string;
  status?: string;
  search?: string;
  department?: string;
  limit?: string;
};

type ConversationMessagesQuery = {
  since?: string;
  afterId?: string;
  beforeId?: string;
  limit?: string;
};

const conversationListInclude = {
  driver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userId: true,
      employeeNumber: true,
      user: {
        select: {
          language: true,
        },
      },
    },
  },
  participants: {
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          language: true,
        },
      },
    },
    orderBy: {
      joinedAt: 'asc',
    },
  },
  messages: {
    take: 1,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      sender: {
        select: {
          id: true,
          fullName: true,
        },
      },
    },
  },
} satisfies Prisma.ConversationInclude;

const conversationDetailInclude = {
  driver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userId: true,
      employeeNumber: true,
      user: {
        select: {
          language: true,
        },
      },
    },
  },
  participants: {
    include: {
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          language: true,
        },
      },
    },
    orderBy: {
      joinedAt: 'asc',
    },
  },
  messages: {
    take: 20,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      sender: {
        select: {
          id: true,
          fullName: true,
        },
      },
      reads: true,
      attachments: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      },
    },
  },
} satisfies Prisma.ConversationInclude;

const messageInclude = {
  sender: {
    select: {
      id: true,
      fullName: true,
    },
  },
  reads: true,
  attachments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.MessageInclude;

const SUPPORTED_LANGUAGES = new Set(['de', 'tr', 'en', 'pl', 'nl', 'it', 'es', 'ru']);
@Injectable()
export class MessengerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly viewerTranslationService: MessengerViewerTranslationService,
    private readonly auditService: AuditService,
    private readonly driverNotify: DriverNotifyService,
    private readonly storageService: StorageService,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  private async safeAuditLog(params: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary?: string;
    metadata?: Prisma.InputJsonValue;
  }) {
    try {
      await this.auditService.logAction(params);
    } catch (error) {
      console.warn('Audit log failed:', error);
    }
  }

  private async resolveCurrentUser(userId: string): Promise<MessengerUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        fullName: true,
        language: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Authenticated user not found');
    }

    return user;
  }

  private assertCanCreateConversation(role: UserRole): void {
    if (role === 'driver' || role === 'customer') {
      throw new ForbiddenException('This role cannot create conversations for another user');
    }
  }

  private parseLimit(rawLimit?: string, fallback = 50): number {
    if (!rawLimit) {
      return fallback;
    }
    const limit = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(limit) || limit <= 0 || limit > 200) {
      throw new BadRequestException('limit must be an integer between 1 and 200');
    }
    return limit;
  }

  private parseListLimit(rawLimit?: string): number {
    return this.parseLimit(rawLimit, 100);
  }

  private normalizeSupportedLanguage(value?: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim().toLowerCase();
    return SUPPORTED_LANGUAGES.has(normalized) ? normalized : null;
  }

  private mapDriver(
    driver: {
      id: string;
      firstName: string;
      lastName: string;
      userId: string | null;
      employeeNumber?: string;
      user?: { language: string } | null;
    },
  ) {
    const preferredLanguage = this.normalizeSupportedLanguage(driver.user?.language);
    return {
      id: driver.id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      userId: driver.userId,
      employeeNumber: driver.employeeNumber ?? null,
      preferredLanguage,
    };
  }

  private parseSince(since?: string): Date | undefined {
    if (!since) {
      return undefined;
    }
    const parsed = new Date(since);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('since must be a valid ISO timestamp');
    }
    return parsed;
  }

  private async resolveLinkedDriverId(userId: string): Promise<string | null> {
    const driver = await this.prisma.driver.findFirst({
      where: { userId },
      select: { id: true },
    });
    return driver?.id ?? null;
  }

  private assertSupportedLanguage(value: string, fieldName: string): void {
    if (!SUPPORTED_LANGUAGES.has(value)) {
      throw new BadRequestException(
        `Unsupported ${fieldName}. Supported values: de, tr, en, pl, nl, it, es, ru`,
      );
    }
  }

  private mapParticipant(
    participant: Prisma.ConversationParticipantGetPayload<{
      include: {
        user: {
          select: {
            id: true;
            fullName: true;
            email: true;
            role: true;
            language: true;
          };
        };
      };
    }>,
  ) {
    return {
      userId: participant.userId,
      role: participant.role,
      joinedAt: participant.joinedAt.toISOString(),
      lastReadAt: participant.lastReadAt?.toISOString() ?? null,
      user: {
        id: participant.user.id,
        fullName: participant.user.fullName,
        email: participant.user.email,
        role: participant.user.role,
        language: participant.user.language,
      },
    };
  }

  private async buildConversationWhere(
    currentUser: MessengerUser,
    query: ConversationListQuery,
  ): Promise<Prisma.ConversationWhereInput> {
    if (currentUser.role === 'driver' && query.driverId) {
      const currentDriver = await this.prisma.driver.findFirst({
        where: { userId: currentUser.id },
        select: { id: true },
      });
      if (!currentDriver || currentDriver.id !== query.driverId) {
        throw new ForbiddenException('Driver can only query own driver conversations');
      }
    }

    const where: Prisma.ConversationWhereInput = {};

    if (query.driverId) {
      where.driverId = query.driverId;
    }

    if (currentUser.role === 'driver') {
      const linkedDriverId = await this.resolveLinkedDriverId(currentUser.id);
      where.participants = {
        some: {
          userId: currentUser.id,
        },
      };
      if (linkedDriverId) {
        where.driverId = linkedDriverId;
      }
    }

    if (query.search?.trim()) {
      const value = query.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { subject: { contains: value, mode: 'insensitive' } },
            { driver: { firstName: { contains: value, mode: 'insensitive' } } },
            { driver: { lastName: { contains: value, mode: 'insensitive' } } },
            { driver: { employeeNumber: { contains: value, mode: 'insensitive' } } },
            {
              messages: {
                some: {
                  OR: [
                    { originalText: { contains: value, mode: 'insensitive' } },
                    { translatedText: { contains: value, mode: 'insensitive' } },
                  ],
                },
              },
            },
          ],
        },
      ];
    }

    if (query.department?.trim()) {
      const department = normalizeMessengerDepartment(query.department);
      if (!canAccessDepartment(currentUser.role, department)) {
        throw new ForbiddenException('You cannot access this messenger department');
      }
      where.department = department;
    } else if (currentUser.role !== 'driver') {
      where.department = { in: allowedDepartmentsForRole(currentUser.role) };
    }

    return where;
  }

  private async mapConversationListItem(
    conversation: Prisma.ConversationGetPayload<{ include: typeof conversationListInclude }>,
    unreadMap: Map<string, number>,
    viewerLanguage: string | null,
  ) {
    const lastMessage = conversation.messages[0] ?? null;
    const viewerTranslatedText = lastMessage
      ? await this.viewerTranslationService.getViewerTranslation({
          message: {
            id: lastMessage.id,
            originalText: lastMessage.originalText,
            originalLanguage: lastMessage.originalLanguage,
          },
          viewerLanguage,
        })
      : null;

    return {
      id: conversation.id,
      subject: conversation.subject,
      department: conversation.department,
      driver: this.mapDriver(conversation.driver),
      participants: conversation.participants.map((participant) => this.mapParticipant(participant)),
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            senderUserId: lastMessage.senderUserId,
            senderName: lastMessage.sender.fullName,
            originalText: lastMessage.originalText,
            translatedText: viewerTranslatedText,
            originalLanguage: lastMessage.originalLanguage,
            targetLanguage: viewerTranslatedText ? viewerLanguage : null,
            translationStatus: viewerTranslatedText
              ? MessageTranslationStatus.translated
              : lastMessage.translationStatus,
            createdAt: lastMessage.createdAt.toISOString(),
          }
        : null,
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      unreadCount: unreadMap.get(conversation.id) ?? 0,
    };
  }

  private mapMessage(
    message: Prisma.MessageGetPayload<{ include: typeof messageInclude }>,
    currentUserId: string,
    viewerTranslatedText: string | null,
    viewerLanguage: string | null,
  ) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderUserId: message.senderUserId,
      senderName: message.sender.fullName,
      originalText: message.originalText,
      translatedText: viewerTranslatedText,
      originalLanguage: message.originalLanguage,
      targetLanguage: viewerTranslatedText ? viewerLanguage : null,
      translationStatus: viewerTranslatedText
        ? MessageTranslationStatus.translated
        : message.translationStatus,
      createdAt: message.createdAt.toISOString(),
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        downloadUrl: this.storageService.buildMessengerAttachmentDownloadPath(attachment.id),
        createdAt: attachment.createdAt.toISOString(),
      })),
      readByCurrentUser:
        message.senderUserId === currentUserId ||
        message.reads.some((messageRead) => messageRead.userId === currentUserId),
    };
  }

  private async persistAttachmentFiles(files: Express.Multer.File[]): Promise<
    Array<{
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storedPath: string;
    }>
  > {
    const results: Array<{
      fileName: string;
      mimeType: string;
      sizeBytes: number;
      storedPath: string;
    }> = [];

    for (const file of files) {
      const safeFileName = sanitizeAttachmentFileName(file.originalname);
      const buffer = await sanitizeAttachmentBuffer(file);
      const storedFileName = buildStoredAttachmentFileName(safeFileName);
      const storedPath = this.storageService.buildStoredPath('message-attachments', storedFileName);
      const absolutePath = join(uploadAbsoluteDirForBucket('message-attachments'), storedFileName);

      await writeFile(absolutePath, buffer);
      await this.objectStorage.syncLocalFile(storedPath);

      results.push({
        fileName: safeFileName,
        mimeType: file.mimetype,
        sizeBytes: buffer.length,
        storedPath,
      });
    }

    return results;
  }

  private async unreadMapForUser(
    userId: string,
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    if (conversationIds.length === 0) {
      return new Map();
    }

    const unreadRows = await this.prisma.message.findMany({
      where: {
        conversationId: {
          in: conversationIds,
        },
        senderUserId: {
          not: userId,
        },
        reads: {
          none: {
            userId,
          },
        },
      },
      select: {
        conversationId: true,
      },
    });

    const unreadMap = new Map<string, number>();
    for (const row of unreadRows) {
      unreadMap.set(row.conversationId, (unreadMap.get(row.conversationId) ?? 0) + 1);
    }
    return unreadMap;
  }

  private async ensureConversationParticipantAccess(
    currentUser: MessengerUser,
    conversationId: string,
  ): Promise<void> {
    if (currentUser.role !== 'driver') {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, department: true },
      });
      if (!conversation) {
        throw new NotFoundException('Conversation not found');
      }
      if (!canAccessDepartment(currentUser.role, conversation.department)) {
        throw new ForbiddenException('You cannot access this messenger department');
      }
      return;
    }

    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId: currentUser.id,
        },
      },
      include: {
        conversation: {
          select: {
            id: true,
            driver: {
              select: {
                id: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (!participant) {
      throw new ForbiddenException('You are not a participant of this conversation');
    }

    const linkedDriverId = await this.resolveLinkedDriverId(currentUser.id);
    const conversationDriver = participant.conversation.driver;
    const ownsConversation =
      conversationDriver.userId === currentUser.id ||
      (linkedDriverId !== null && conversationDriver.id === linkedDriverId);

    if (!ownsConversation) {
      throw new ForbiddenException('Driver can only access own conversation threads');
    }
  }

  async listConversations(currentUserId: string, query: ConversationListQuery) {
    const currentUser = await this.resolveCurrentUser(currentUserId);
    const where = await this.buildConversationWhere(currentUser, query);
    const limit = this.parseListLimit(query.limit);

    const conversations = await this.prisma.conversation.findMany({
      where,
      include: conversationListInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    const unreadMap = await this.unreadMapForUser(
      currentUser.id,
      conversations.map((conversation) => conversation.id),
    );

    const viewerLanguage = this.normalizeSupportedLanguage(currentUser.language);

    return Promise.all(
      conversations.map((conversation) =>
        this.mapConversationListItem(conversation, unreadMap, viewerLanguage),
      ),
    );
  }

  async getStats(currentUserId: string, query: Pick<ConversationListQuery, 'department' | 'search'>) {
    const currentUser = await this.resolveCurrentUser(currentUserId);
    const where = await this.buildConversationWhere(currentUser, query);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [totalConversations, messagesLast24Hours, unreadRows] = await Promise.all([
      this.prisma.conversation.count({ where }),
      this.prisma.message.count({
        where: {
          conversation: where,
          createdAt: { gte: since24h },
        },
      }),
      this.prisma.message.findMany({
        where: {
          conversation: where,
          senderUserId: { not: currentUser.id },
          reads: { none: { userId: currentUser.id } },
        },
        select: { conversationId: true },
      }),
    ]);

    const unreadByConversation = new Map<string, number>();
    for (const row of unreadRows) {
      unreadByConversation.set(row.conversationId, (unreadByConversation.get(row.conversationId) ?? 0) + 1);
    }

    return {
      totalConversations,
      unreadTotal: unreadRows.length,
      conversationsWithUnread: unreadByConversation.size,
      messagesLast24Hours,
    };
  }

  async exportConversationsCsv(currentUserId: string, query: ConversationListQuery): Promise<string> {
    const currentUser = await this.resolveCurrentUser(currentUserId);
    const where = await this.buildConversationWhere(currentUser, query);

    const conversations = await this.prisma.conversation.findMany({
      where,
      include: conversationListInclude,
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });

    const unreadMap = await this.unreadMapForUser(
      currentUser.id,
      conversations.map((conversation) => conversation.id),
    );

    const viewerLanguage = this.normalizeSupportedLanguage(currentUser.language);

    const mappedConversations = await Promise.all(
      conversations.map((conversation) => this.mapConversationListItem(conversation, unreadMap, viewerLanguage)),
    );

    return buildMessengerConversationsCsv(
      mappedConversations.map((mapped) => {
        const preview =
          mapped.lastMessage?.translatedText?.trim() ||
          mapped.lastMessage?.originalText?.trim() ||
          '';
        return {
          driverName: `${mapped.driver.firstName} ${mapped.driver.lastName}`.trim(),
          employeeNumber: mapped.driver.employeeNumber ?? '',
          department: mapped.department,
          subject: mapped.subject ?? '',
          lastMessageAt: mapped.lastMessageAt ?? '',
          unreadCount: mapped.unreadCount,
          lastMessagePreview: preview.slice(0, 200),
        };
      }),
    );
  }

  async createConversation(currentUserId: string, dto: CreateConversationDto) {
    const currentUser = await this.resolveCurrentUser(currentUserId);

    if (currentUser.role === 'driver') {
      return this.createConversationAsDriver(currentUser, dto);
    }

    this.assertCanCreateConversation(currentUser.role);

    if (!dto.driverId?.trim()) {
      throw new BadRequestException('driverId is required');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: dto.driverId.trim() },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    if (!driver.userId) {
      throw new BadRequestException('Driver has no linked user account');
    }
    const conversationDriver = { id: driver.id, userId: driver.userId };

    const normalizedSubject = dto.subject?.trim() || null;
    const department = normalizeMessengerDepartment(dto.department);
    if (!canAccessDepartment(currentUser.role, department)) {
      throw new ForbiddenException('You cannot create conversations in this department');
    }

    return this.createConversationRecord({
      currentUser,
      driver: conversationDriver,
      normalizedSubject,
      department,
      participantIds: Array.from(new Set([currentUser.id, conversationDriver.userId])),
      participantRoleForUser: (participantId) =>
        participantId === conversationDriver.userId ? 'driver' : currentUser.role,
    });
  }

  private async createConversationAsDriver(
    currentUser: MessengerUser,
    dto: CreateConversationDto,
  ) {
    const normalizedSubject = dto.subject?.trim();
    if (!normalizedSubject) {
      throw new BadRequestException('subject is required');
    }

    const driver = await this.prisma.driver.findFirst({
      where: { userId: currentUser.id },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!driver?.userId) {
      throw new BadRequestException('Driver has no linked user account');
    }
    const conversationDriver = { id: driver.id, userId: driver.userId };

    const department = normalizeDriverConversationDepartment(dto.department);

    return this.createConversationRecord({
      currentUser,
      driver: conversationDriver,
      normalizedSubject,
      department,
      participantIds: [conversationDriver.userId],
      participantRoleForUser: () => 'driver',
    });
  }

  private async createConversationRecord(params: {
    currentUser: MessengerUser;
    driver: { id: string; userId: string };
    normalizedSubject: string | null;
    department: ReturnType<typeof normalizeMessengerDepartment>;
    participantIds: string[];
    participantRoleForUser: (participantId: string) => UserRole | 'driver';
  }) {
    const { currentUser, driver, normalizedSubject, department, participantIds, participantRoleForUser } =
      params;

    const existing = await this.prisma.conversation.findFirst({
      where: {
        driverId: driver.id,
        subject: normalizedSubject,
        department,
      },
      select: { id: true },
      orderBy: [{ updatedAt: 'desc' }],
    });

    if (existing) {
      return this.getConversationDetail(currentUser.id, existing.id);
    }

    const createdConversation = await this.prisma.conversation.create({
      data: {
        driverId: driver.id,
        createdById: currentUser.id,
        subject: normalizedSubject,
        department,
        participants: {
          create: participantIds.map((participantId) => ({
            userId: participantId,
            role: participantRoleForUser(participantId),
          })),
        },
      },
      select: { id: true },
    });

    await this.safeAuditLog({
      actorUserId: currentUser.id,
      action: 'messenger.conversation_created',
      entityType: 'conversation',
      entityId: createdConversation.id,
      summary: 'Conversation created',
      metadata: {
        driverId: driver.id,
        subject: normalizedSubject,
        department,
        createdByRole: currentUser.role,
      },
    });

    return this.getConversationDetail(currentUser.id, createdConversation.id);
  }

  async getConversationDetail(currentUserId: string, conversationId: string) {
    const currentUser = await this.resolveCurrentUser(currentUserId);
    await this.ensureConversationParticipantAccess(currentUser, conversationId);

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: conversationDetailInclude,
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const unreadMap = await this.unreadMapForUser(currentUser.id, [conversation.id]);
    const viewerLanguage = this.normalizeSupportedLanguage(currentUser.language);
    const translationMap = await this.viewerTranslationService.primeViewerTranslations({
      messages: conversation.messages.map((message) => ({
        id: message.id,
        originalText: message.originalText,
        originalLanguage: message.originalLanguage,
      })),
      viewerLanguage,
    });

    return {
      id: conversation.id,
      subject: conversation.subject,
      department: conversation.department,
      driver: this.mapDriver(conversation.driver),
      participants: conversation.participants.map((participant) => this.mapParticipant(participant)),
      lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
      unreadCount: unreadMap.get(conversation.id) ?? 0,
      messagesPreview: [...conversation.messages]
        .reverse()
        .map((message) =>
          this.mapMessage(
            message,
            currentUser.id,
            translationMap.get(message.id) ?? null,
            viewerLanguage,
          ),
        ),
    };
  }

  async listMessages(
    currentUserId: string,
    conversationId: string,
    query: ConversationMessagesQuery,
  ) {
    const currentUser = await this.resolveCurrentUser(currentUserId);
    await this.ensureConversationParticipantAccess(currentUser, conversationId);

    const limit = this.parseLimit(query.limit);
    const sinceDate = this.parseSince(query.since);

    const filters: Prisma.MessageWhereInput[] = [
      {
        conversationId,
      },
    ];

    if (sinceDate) {
      filters.push({
        createdAt: {
          gt: sinceDate,
        },
      });
    }

    if (query.afterId) {
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: query.afterId },
        select: { id: true, conversationId: true, createdAt: true },
      });
      if (!cursorMessage || cursorMessage.conversationId !== conversationId) {
        throw new NotFoundException('afterId message not found in this conversation');
      }

      filters.push({
        OR: [
          { createdAt: { gt: cursorMessage.createdAt } },
          {
            AND: [{ createdAt: cursorMessage.createdAt }, { id: { gt: cursorMessage.id } }],
          },
        ],
      });
    }

    if (query.beforeId) {
      const cursorMessage = await this.prisma.message.findUnique({
        where: { id: query.beforeId },
        select: { id: true, conversationId: true, createdAt: true },
      });
      if (!cursorMessage || cursorMessage.conversationId !== conversationId) {
        throw new NotFoundException('beforeId message not found in this conversation');
      }

      filters.push({
        OR: [
          { createdAt: { lt: cursorMessage.createdAt } },
          {
            AND: [{ createdAt: cursorMessage.createdAt }, { id: { lt: cursorMessage.id } }],
          },
        ],
      });
    }

    const messages = await this.prisma.message.findMany({
      where: {
        AND: filters,
      },
      include: messageInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit,
    });

    const viewerLanguage = this.normalizeSupportedLanguage(currentUser.language);
    const translationMap = await this.viewerTranslationService.primeViewerTranslations({
      messages: messages.map((message) => ({
        id: message.id,
        originalText: message.originalText,
        originalLanguage: message.originalLanguage,
      })),
      viewerLanguage,
    });

    return messages.map((message) =>
      this.mapMessage(
        message,
        currentUser.id,
        translationMap.get(message.id) ?? null,
        viewerLanguage,
      ),
    );
  }

  async sendMessage(
    currentUserId: string,
    conversationId: string,
    dto: SendMessageDto,
    attachments: Express.Multer.File[] = [],
  ) {
    const currentUser = await this.resolveCurrentUser(currentUserId);
    await this.ensureConversationParticipantAccess(currentUser, conversationId);

    assertMessengerAttachmentsInput(attachments);

    const normalizedText = dto.text?.trim() ?? '';
    if (!normalizedText && attachments.length === 0) {
      throw new BadRequestException('Either text or at least one attachment is required');
    }

    if (dto.originalLanguage) {
      this.assertSupportedLanguage(dto.originalLanguage, 'originalLanguage');
    }
    if (dto.targetLanguage) {
      this.assertSupportedLanguage(dto.targetLanguage, 'targetLanguage');
    }

    const fallbackLanguage = this.normalizeSupportedLanguage(currentUser.language) ?? 'de';
    const storedOriginalLanguage = dto.originalLanguage
      ? this.normalizeSupportedLanguage(dto.originalLanguage) ?? fallbackLanguage
      : await this.viewerTranslationService.resolveSenderLanguage(currentUser.id, normalizedText);

    const persistedAttachments = await this.persistAttachmentFiles(attachments);

    const createdMessage = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          conversationId,
          senderUserId: currentUser.id,
          originalText: normalizedText,
          translatedText: null,
          originalLanguage: storedOriginalLanguage,
          targetLanguage: null,
          translationStatus: MessageTranslationStatus.not_requested,
          translatedAt: null,
          attachments: persistedAttachments.length
            ? {
                create: persistedAttachments.map((attachment) => ({
                  fileName: attachment.fileName,
                  mimeType: attachment.mimeType,
                  sizeBytes: attachment.sizeBytes,
                  storedPath: attachment.storedPath,
                })),
              }
            : undefined,
        },
        include: messageInclude,
      });

      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: message.createdAt,
        },
      });

      return message;
    });

    await this.safeAuditLog({
      actorUserId: currentUser.id,
      action: 'messenger.message_sent',
      entityType: 'message',
      entityId: createdMessage.id,
      summary: 'Messenger message sent',
      metadata: {
        conversationId,
        translationStatus: createdMessage.translationStatus,
        attachmentCount: createdMessage.attachments.length,
      },
    });

    const recipients = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { not: currentUser.id },
      },
      select: { userId: true },
    });

    const preview =
      createdMessage.originalText.trim().slice(0, 120);

    for (const recipient of recipients) {
      this.driverNotify.notifyUserSafely({
        userId: recipient.userId,
        key: 'messenger_message',
        params: { preview },
        type: 'system',
        relatedEntityType: 'conversation',
        relatedEntityId: conversationId,
      });
    }

    const viewerLanguage = this.normalizeSupportedLanguage(currentUser.language);
    const viewerTranslatedText = await this.viewerTranslationService.getViewerTranslation({
      message: {
        id: createdMessage.id,
        originalText: createdMessage.originalText,
        originalLanguage: createdMessage.originalLanguage,
      },
      viewerLanguage,
    });

    return this.mapMessage(createdMessage, currentUser.id, viewerTranslatedText, viewerLanguage);
  }

  async resolveAttachmentDownload(currentUserId: string, attachmentId: string) {
    const currentUser = await this.resolveCurrentUser(currentUserId);

    const attachment = await this.prisma.messageAttachment.findUnique({
      where: { id: attachmentId },
      include: {
        message: {
          select: {
            conversationId: true,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    await this.ensureConversationParticipantAccess(currentUser, attachment.message.conversationId);

    const object = await this.objectStorage.openStoredFile(attachment.storedPath);
    if (!object) {
      throw new NotFoundException('Attachment file is missing');
    }

    await this.safeAuditLog({
      actorUserId: currentUser.id,
      action: 'messenger.attachment_downloaded',
      entityType: 'message_attachment',
      entityId: attachment.id,
      summary: 'Messenger attachment downloaded',
      metadata: {
        conversationId: attachment.message.conversationId,
        messageId: attachment.messageId,
      },
    });

    return {
      stream: object.stream,
      mimeType: object.contentType || attachment.mimeType || 'application/octet-stream',
      fileName: attachment.fileName,
    };
  }

  async markConversationRead(currentUserId: string, conversationId: string) {
    const currentUser = await this.resolveCurrentUser(currentUserId);
    await this.ensureConversationParticipantAccess(currentUser, conversationId);

    const now = new Date();

    const unreadMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        reads: {
          none: {
            userId: currentUser.id,
          },
        },
      },
      select: {
        id: true,
      },
    });

    await this.prisma.$transaction(async (tx) => {
      if (unreadMessages.length > 0) {
        await tx.messageRead.createMany({
          data: unreadMessages.map((message) => ({
            messageId: message.id,
            userId: currentUser.id,
            readAt: now,
          })),
          skipDuplicates: true,
        });
      }

      await tx.conversationParticipant.upsert({
        where: {
          conversationId_userId: {
            conversationId,
            userId: currentUser.id,
          },
        },
        update: {
          lastReadAt: now,
        },
        create: {
          conversationId,
          userId: currentUser.id,
          role: currentUser.role,
          lastReadAt: now,
        },
      });
    });

    await this.safeAuditLog({
      actorUserId: currentUser.id,
      action: 'messenger.conversation_read',
      entityType: 'conversation',
      entityId: conversationId,
      summary: 'Conversation marked as read',
      metadata: {
        markedReadCount: unreadMessages.length,
      },
    });

    return {
      conversationId,
      markedReadCount: unreadMessages.length,
      lastReadAt: now.toISOString(),
    };
  }

  async unreadCount(currentUserId: string) {
    const currentUser = await this.resolveCurrentUser(currentUserId);
    const conversationWhere =
      currentUser.role === 'driver'
        ? await this.buildConversationWhere(currentUser, {})
        : { department: { in: allowedDepartmentsForRole(currentUser.role) } };

    const rows = await this.prisma.message.findMany({
      where: {
        conversation: conversationWhere,
        senderUserId: {
          not: currentUser.id,
        },
        reads: {
          none: {
            userId: currentUser.id,
          },
        },
      },
      select: {
        conversationId: true,
      },
    });

    const byConversationMap = new Map<string, number>();
    for (const row of rows) {
      byConversationMap.set(row.conversationId, (byConversationMap.get(row.conversationId) ?? 0) + 1);
    }

    return {
      total: rows.length,
      byConversation: Array.from(byConversationMap.entries()).map(([conversationId, count]) => ({
        conversationId,
        count,
      })),
    };
  }
}
