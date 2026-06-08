import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, User, UserRole, UserStatus } from '@prisma/client';
import { changedFieldNames, safeAuditLog } from '../audit/audit-helper';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const SALT_ROUNDS = 10;

function toClientUser(u: User) {
  return {
    id: u.id,
    full_name: u.fullName,
    email: u.email,
    role: u.role,
    status: u.status,
    language: u.language,
    created_at: u.createdAt.toISOString(),
    updated_at: u.updatedAt.toISOString(),
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly billingService: BillingService,
  ) {}

  async list(query: {
    role?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.UserWhereInput = {};
    if (query.role && Object.values(UserRole).includes(query.role as UserRole)) {
      where.role = query.role as UserRole;
    }
    if (query.status && Object.values(UserStatus).includes(query.status as UserStatus)) {
      where.status = query.status as UserStatus;
    }
    const search = (query.search ?? '').trim();
    if (search.length > 0) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }
    const usePagination =
      Number.isFinite(query.page) || Number.isFinite(query.limit);
    const page = usePagination ? Math.max(1, query.page ?? 1) : 1;
    const limit = usePagination
      ? Math.min(200, Math.max(1, query.limit ?? 50))
      : undefined;

    const [total, users] = await Promise.all([
      usePagination ? this.prisma.user.count({ where }) : Promise.resolve(0),
      this.prisma.user.findMany({
        where,
        orderBy: { fullName: 'asc' },
        ...(usePagination ? { skip: (page - 1) * (limit ?? 50), take: limit } : {}),
      }),
    ]);

    const response: {
      data: ReturnType<typeof toClientUser>[];
      total?: number;
      page?: number;
      limit?: number;
      pages?: number;
    } = { data: users.map(toClientUser) };

    if (usePagination && limit) {
      response.total = total;
      response.page = page;
      response.limit = limit;
      response.pages = Math.ceil(total / limit);
    }

    return response;
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return toClientUser(user);
  }

  async create(dto: CreateUserDto, actorUserId?: string, tenantId?: string) {
    if (dto.role !== 'driver') {
      await this.billingService.assertCanAddSeat(tenantId);
    }
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        tenantId,
        fullName: dto.full_name,
        email: dto.email,
        passwordHash,
        role: dto.role,
        status: dto.status ?? UserStatus.active,
        language: dto.language ?? 'de',
      },
    });
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      summary: 'User created',
    });
    return toClientUser(user);
  }

  async update(id: string, dto: UpdateUserDto, actorUserId?: string) {
    await this.assertExists(id);
    const data: Prisma.UserUpdateInput = {};
    if (dto.full_name !== undefined) data.fullName = dto.full_name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.language !== undefined) data.language = dto.language;

    const user = await this.prisma.user.update({ where: { id }, data });

    const changed = changedFieldNames(dto as Record<string, unknown>).filter((f) => f !== 'password');
    if (changed.length > 0) {
      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'user.updated',
        entityType: 'user',
        entityId: id,
        summary: 'User updated',
        metadata: { changed_fields: changed },
      });
    }
    if (dto.password !== undefined) {
      await safeAuditLog(this.auditService, {
        actorUserId,
        action: 'user.password_changed',
        entityType: 'user',
        entityId: id,
        summary: 'User password changed',
      });
    }

    return toClientUser(user);
  }

  async deactivate(id: string, actorUserId?: string) {
    await this.assertExists(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.inactive },
    });
    await safeAuditLog(this.auditService, {
      actorUserId,
      action: 'user.deactivated',
      entityType: 'user',
      entityId: id,
      summary: 'User deactivated',
    });
    return toClientUser(user);
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('User not found');
  }
}
