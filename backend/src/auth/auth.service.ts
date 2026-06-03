import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { resolveCustomerCompanyContext } from './customer-company-context';

interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  language: string;
  companyIds?: string[];
  companyId?: string | null;
  companies?: { id: string; name: string }[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auditService: AuditService,
  ) {}

  private async safeAuditLog(params: {
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    summary?: string;
    metadata?: Prisma.InputJsonValue;
    ipAddress?: string;
    userAgent?: string;
  }) {
    try {
      await this.auditService.logAction(params);
    } catch (error) {
      console.warn('Audit log failed:', error);
    }
  }

  private async buildAuthUserPayload(user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    language: string;
  }): Promise<AuthUserPayload> {
    const payload: AuthUserPayload = {
      id: user.id,
      email: user.email,
      name: user.fullName,
      role: user.role,
      language: user.language,
    };

    if (user.role === 'customer') {
      const companyContext = await resolveCustomerCompanyContext(this.prisma, user.id);
      if (companyContext) {
        payload.companyIds = companyContext.companyIds;
        payload.companyId = companyContext.companyId;
        payload.companies = companyContext.companies;
      }
    }

    return payload;
  }

  async login(
    email: string,
    password: string,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<{
    accessToken: string;
    user: AuthUserPayload;
  }> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user || user.status !== 'active') {
      await this.safeAuditLog({
        action: 'auth.login_failed',
        entityType: 'auth',
        summary: 'Login failed',
        metadata: { email: normalizedEmail, reason: 'invalid_credentials' },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.safeAuditLog({
        actorUserId: user.id,
        action: 'auth.login_failed',
        entityType: 'auth',
        entityId: user.id,
        summary: 'Login failed',
        metadata: { reason: 'invalid_credentials' },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'auth.login_success',
      entityType: 'auth',
      entityId: user.id,
      summary: 'User login successful',
      metadata: { role: user.role },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      accessToken,
      user: await this.buildAuthUserPayload(user),
    };
  }

  async getById(id: string): Promise<AuthUserPayload> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found');
    }
    return this.buildAuthUserPayload(user);
  }
}
