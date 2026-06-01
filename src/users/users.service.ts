import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma, User, UserRole, UserStatus } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

  async list(query: { role?: string; status?: string; search?: string }) {
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
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { fullName: 'asc' },
    });
    return { data: users.map(toClientUser) };
  }

  async getById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return toClientUser(user);
  }

  async create(dto: CreateUserDto) {
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        fullName: dto.full_name,
        email: dto.email,
        passwordHash,
        role: dto.role,
        status: dto.status ?? UserStatus.active,
        language: dto.language ?? 'de',
      },
    });
    return toClientUser(user);
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.assertExists(id);
    const data: Prisma.UserUpdateInput = {};
    if (dto.full_name !== undefined) data.fullName = dto.full_name;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.language !== undefined) data.language = dto.language;

    const user = await this.prisma.user.update({ where: { id }, data });
    return toClientUser(user);
  }

  async deactivate(id: string) {
    await this.assertExists(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.inactive },
    });
    return toClientUser(user);
  }

  private async assertExists(id: string): Promise<void> {
    const exists = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('User not found');
  }
}
