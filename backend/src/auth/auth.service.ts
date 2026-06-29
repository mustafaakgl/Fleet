import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service';
import { getFrontendUrl } from '../config/env.validation';
import { passwordResetMail } from '../mail/mail-templates';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { isFleetOpsEmail } from '../config/fleet-ops';
import { isPublicSignupEnabled } from '../config/public-signup';
import { OnboardingService } from '../onboarding/onboarding.service';
import { SetupTenantDto } from '../onboarding/dto/setup-tenant.dto';
import { resolveCustomerCompanyContext } from './customer-company-context';
import { MfaService } from './mfa.service';
import { TenantAccessService } from '../tenant/tenant-access.service';

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  fleetOps: boolean;
}

interface RefreshJwtPayload {
  sub: string;
  purpose: 'refresh';
  tokenId: string;
}

interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  role: string;
  language: string;
  fleet_ops?: boolean;
  companyIds?: string[];
  companyId?: string | null;
  companies?: { id: string; name: string }[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly mailService: MailService,
    private readonly onboarding: OnboardingService,
    private readonly mfaService: MfaService,
    private readonly tenantAccess: TenantAccessService,
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

  private hashRefreshToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private getJwtSecretOrThrow(): string {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }

    return jwtSecret;
  }

  async generateRefreshToken(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ token: string; tokenId: string; expiresAt: Date }> {
    const tokenId = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const token = await this.jwt.signAsync(
      {
        sub: userId,
        purpose: 'refresh' as const,
        tokenId,
      } satisfies RefreshJwtPayload,
      {
        secret: this.getJwtSecretOrThrow(),
        expiresIn: '7d',
      },
    );

    const created = await this.prisma.unscoped.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashRefreshToken(token),
        expiresAt,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
      select: { id: true },
    });

    return { token, tokenId: created.id, expiresAt };
  }

  private async verifyRefreshTokenSignature(refreshToken: string): Promise<RefreshJwtPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshJwtPayload>(refreshToken, {
        secret: this.getJwtSecretOrThrow(),
      });

      if (payload.purpose !== 'refresh' || !payload.sub || !payload.tokenId) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async signAccessToken(payload: JwtPayload): Promise<string> {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }

    return this.jwt.signAsync(payload, {
      secret: jwtSecret,
      expiresIn: ACCESS_TOKEN_TTL,
    });
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
      fleet_ops: isFleetOpsEmail(user.email),
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

  private async assertTenantActiveForAuth(
    tenantId: string,
    options?: {
      genericError?: boolean;
      ipAddress?: string;
      userAgent?: string;
      email?: string;
      userId?: string;
    },
  ): Promise<void> {
    try {
      await this.tenantAccess.assertTenantAllowsLogin(tenantId);
    } catch (error) {
      await this.safeAuditLog({
        actorUserId: options?.userId,
        action: 'auth.login_failed',
        entityType: 'auth',
        entityId: options?.userId,
        summary: 'Login blocked by tenant status',
        metadata: {
          email: options?.email,
          reason: error instanceof ForbiddenException ? 'tenant_blocked' : 'tenant_not_found',
        },
        ipAddress: options?.ipAddress,
        userAgent: options?.userAgent,
      });
      if (options?.genericError) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (error instanceof ForbiddenException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async login(
    email: string,
    password: string,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<
    | {
        accessToken: string;
        refreshToken: string;
        user: AuthUserPayload;
        mfa_required?: false;
      }
    | {
        mfa_required: true;
        mfa_token: string;
      }
  > {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.unscoped.user.findFirst({
      where: { email: normalizedEmail },
    });
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

    await this.assertTenantActiveForAuth(user.tenantId, {
      genericError: true,
      email: normalizedEmail,
      userId: user.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    if (user.mfaEnabled && user.mfaSecret) {
      const mfaToken = await this.mfaService.createMfaPendingToken(user);
      await this.safeAuditLog({
        actorUserId: user.id,
        action: 'auth.mfa_challenge_issued',
        entityType: 'auth',
        entityId: user.id,
        summary: 'MFA challenge issued after password login',
        metadata: { role: user.role },
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
      return {
        mfa_required: true,
        mfa_token: mfaToken,
      };
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      fleetOps: isFleetOpsEmail(user.email),
    };
    const accessToken = await this.signAccessToken(payload);
    const refresh = await this.generateRefreshToken(user.id, context);

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
      refreshToken: refresh.token,
      user: await this.buildAuthUserPayload(user),
      mfa_required: false,
    };
  }

  async refreshTokens(
    refreshToken: string,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUserPayload }> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const existing = await this.prisma.unscoped.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            language: true,
            status: true,
            tenantId: true,
          },
        },
      },
    });

    if (!existing || existing.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.verifyRefreshTokenSignature(refreshToken);

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!existing.user || existing.user.status !== 'active') {
      throw new UnauthorizedException('User not found');
    }

    await this.assertTenantActiveForAuth(existing.user.tenantId, {
      genericError: true,
      email: existing.user.email,
      userId: existing.user.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const nextRefresh = await this.generateRefreshToken(existing.user.id, context);

    await this.prisma.unscoped.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: nextRefresh.tokenId },
    });

    const accessToken = await this.signAccessToken({
      sub: existing.user.id,
      email: existing.user.email,
      role: existing.user.role,
      tenantId: existing.user.tenantId,
      fleetOps: isFleetOpsEmail(existing.user.email),
    });

    return {
      accessToken,
      refreshToken: nextRefresh.token,
      user: await this.buildAuthUserPayload(existing.user),
    };
  }

  async issueSessionForUser(
    userId: string,
    context?: {
      method?: 'oidc' | 'password';
      ipAddress?: string;
      userAgent?: string;
    },
  ): Promise<{ accessToken: string; user: AuthUserPayload }> {
    const user = await this.prisma.unscoped.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found');
    }

    await this.assertTenantActiveForAuth(user.tenantId, {
      email: user.email,
      userId: user.id,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      fleetOps: isFleetOpsEmail(user.email),
    });

    await this.safeAuditLog({
      actorUserId: user.id,
      action: context?.method === 'oidc' ? 'auth.oidc_login_success' : 'auth.login_success',
      entityType: 'auth',
      entityId: user.id,
      summary: context?.method === 'oidc' ? 'OIDC login successful' : 'User login successful',
      metadata: { role: user.role, method: context?.method ?? 'password' },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return {
      accessToken,
      user: await this.buildAuthUserPayload(user),
    };
  }

  async completeMfaLogin(
    mfaToken: string,
    code: string,
    context?: { ipAddress?: string; userAgent?: string },
  ) {
    const { user, accessToken } = await this.mfaService.completeLogin(mfaToken, code, context);
    return {
      accessToken,
      user: await this.buildAuthUserPayload(user),
    };
  }

  /**
   * Issues a fresh access token for an already-authenticated user (refresh flow).
   * Performs the same active-user and tenant-status checks as login, without
   * emitting a login audit event.
   */
  async refreshSession(userId: string): Promise<{ accessToken: string; user: AuthUserPayload }> {
    const user = await this.prisma.unscoped.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found');
    }

    await this.tenantAccess.assertTenantAllowsLogin(user.tenantId).catch(() => {
      throw new UnauthorizedException('Invalid session');
    });

    const accessToken = await this.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      fleetOps: isFleetOpsEmail(user.email),
    });

    return {
      accessToken,
      user: await this.buildAuthUserPayload(user),
    };
  }

  async getById(id: string): Promise<AuthUserPayload & { mfa_enabled: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found');
    }
    return {
      ...(await this.buildAuthUserPayload(user)),
      mfa_enabled: user.mfaEnabled,
    };
  }

  private hashResetToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async signup(dto: SetupTenantDto) {
    if (!isPublicSignupEnabled()) {
      throw new BadRequestException('Public signup is not enabled');
    }
    return this.onboarding.provisionTenant(dto);
  }

  async forgotPassword(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.unscoped.user.findFirst({
      where: { email: normalizedEmail, status: 'active' },
      select: { id: true, email: true },
    });

    if (user) {
      await this.issuePasswordResetToken(user.id, user.email, undefined);
    }

    return {
      success: true,
      message: 'If an account exists, a reset link has been sent.',
    };
  }

  private async issuePasswordResetToken(
    userId: string,
    userEmail: string,
    createdById?: string,
  ) {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        createdById,
      },
    });

    const resetUrl = `${getFrontendUrl()}/reset-password?token=${rawToken}`;
    const template = passwordResetMail({
      resetUrl,
      expiresAt: expiresAt.toISOString(),
    });
    const mailResult = await this.mailService.sendMail({
      to: userEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });

    await this.safeAuditLog({
      actorUserId: createdById,
      action: 'auth.password_reset_requested',
      entityType: 'user',
      entityId: userId,
      summary: 'Password reset link created',
      metadata: {
        self_service: !createdById,
        expiresAt: expiresAt.toISOString(),
        mail_mode: mailResult.mode,
        mail_sent: mailResult.sent,
      },
    });

    return { resetUrl, expiresAt, mailResult };
  }

  async requestPasswordReset(adminUserId: string, targetUserId: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, status: true },
    });
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }
    if (targetUser.status !== 'active') {
      throw new BadRequestException('Cannot reset password for inactive user');
    }

    const { resetUrl, expiresAt, mailResult } = await this.issuePasswordResetToken(
      targetUser.id,
      targetUser.email,
      adminUserId,
    );

    return {
      reset_url: resetUrl,
      expires_at: expiresAt.toISOString(),
      user_email: targetUser.email,
      mail_sent: mailResult.sent,
      mail_mode: mailResult.mode,
    };
  }

  async validatePasswordResetToken(token: string) {
    const tokenHash = this.hashResetToken(token.trim());
    const row = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { select: { email: true, status: true } },
      },
    });

    if (!row || row.user.status !== 'active') {
      return { valid: false as const };
    }

    return {
      valid: true as const,
      email: row.user.email,
      expires_at: row.expiresAt.toISOString(),
    };
  }

  async confirmPasswordReset(token: string, password: string) {
    const tokenHash = this.hashResetToken(token.trim());
    const row = await this.prisma.passwordResetToken.findFirst({
      where: {
        tokenHash,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: { select: { id: true, status: true } },
      },
    });

    if (!row || row.user.status !== 'active') {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: row.userId,
          usedAt: null,
          id: { not: row.id },
        },
        data: { usedAt: new Date() },
      }),
      // Revoke all active refresh tokens — password change invalidates sessions.
      this.prisma.unscoped.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.safeAuditLog({
      actorUserId: row.userId,
      action: 'auth.password_reset_completed',
      entityType: 'user',
      entityId: row.userId,
      summary: 'Password reset completed',
    });

    return { success: true };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true, status: true },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found');
    }

    const currentOk = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!currentOk) {
      throw new UnauthorizedException('Invalid current password');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      }),
      this.prisma.unscoped.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.safeAuditLog({
      actorUserId: userId,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: userId,
      summary: 'Password changed by user',
    });

    return { success: true };
  }

  async updateLoginProfile(
    userId: string,
    dto: { email?: string; language?: string },
  ): Promise<AuthUserPayload & { mfa_enabled: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User not found');
    }

    const data: { email?: string; language?: string } = {};

    if (dto.email !== undefined) {
      const normalizedEmail = dto.email.trim().toLowerCase();
      const existing = await this.prisma.user.findFirst({
        where: {
          tenantId: user.tenantId,
          email: normalizedEmail,
          NOT: { id: userId },
        },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException('A user with this email already exists');
      }
      data.email = normalizedEmail;
    }

    if (dto.language !== undefined) {
      data.language = dto.language;
    }

    const updated =
      Object.keys(data).length > 0
        ? await this.prisma.user.update({ where: { id: userId }, data })
        : user;

    if (Object.keys(data).length > 0) {
      await this.safeAuditLog({
        actorUserId: userId,
        action: 'auth.profile_updated',
        entityType: 'user',
        entityId: userId,
        summary: 'Login profile updated',
        metadata: { changed_fields: Object.keys(data) },
      });
    }

    return {
      ...(await this.buildAuthUserPayload(updated)),
      mfa_enabled: updated.mfaEnabled,
    };
  }
}
