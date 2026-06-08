import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { isFleetOpsEmail } from '../config/fleet-ops';

const MFA_PENDING_TTL = '5m';
const MFA_ISSUER = process.env.MFA_ISSUER?.trim() || 'Fleet';

type MfaPendingPayload = {
  sub: string;
  email: string;
  role: string;
  tenantId: string;
  purpose: 'mfa_pending';
};

@Injectable()
export class MfaService {
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

  private verifyCode(secret: string, code: string): boolean {
    return authenticator.verify({ token: code, secret });
  }

  async createMfaPendingToken(user: {
    id: string;
    email: string;
    role: string;
    tenantId: string;
  }): Promise<string> {
    return this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        purpose: 'mfa_pending',
      } satisfies MfaPendingPayload,
      { expiresIn: MFA_PENDING_TTL },
    );
  }

  async verifyMfaPendingToken(token: string): Promise<MfaPendingPayload> {
    try {
      const payload = await this.jwt.verifyAsync<MfaPendingPayload>(token);
      if (payload.purpose !== 'mfa_pending' || !payload.sub) {
        throw new UnauthorizedException('Invalid MFA token');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
  }

  async beginSetup(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, mfaEnabled: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = authenticator.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaPendingSecret: secret },
    });

    const otpauthUrl = authenticator.keyuri(user.email, MFA_ISSUER, secret);

    await this.safeAuditLog({
      actorUserId: userId,
      action: 'auth.mfa_setup_started',
      entityType: 'user',
      entityId: userId,
      summary: 'MFA setup started',
    });

    return {
      secret,
      otpauth_url: otpauthUrl,
    };
  }

  async confirmSetup(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, mfaEnabled: true, mfaPendingSecret: true },
    });
    if (!user?.mfaPendingSecret) {
      throw new BadRequestException('MFA setup not started');
    }
    if (!this.verifyCode(user.mfaPendingSecret, code)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaSecret: user.mfaPendingSecret,
        mfaPendingSecret: null,
      },
    });

    await this.safeAuditLog({
      actorUserId: userId,
      action: 'auth.mfa_enabled',
      entityType: 'user',
      entityId: userId,
      summary: 'MFA enabled',
    });

    return { success: true, mfa_enabled: true };
  }

  async disable(userId: string, password: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        passwordHash: true,
        mfaEnabled: true,
        mfaSecret: true,
      },
    });
    if (!user?.mfaEnabled || !user.mfaSecret) {
      throw new BadRequestException('MFA is not enabled');
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid password');
    }
    if (!this.verifyCode(user.mfaSecret, code)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaPendingSecret: null,
      },
    });

    await this.safeAuditLog({
      actorUserId: userId,
      action: 'auth.mfa_disabled',
      entityType: 'user',
      entityId: userId,
      summary: 'MFA disabled',
    });

    return { success: true, mfa_enabled: false };
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mfaEnabled: true, mfaPendingSecret: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return {
      mfa_enabled: user.mfaEnabled,
      mfa_setup_pending: Boolean(user.mfaPendingSecret),
    };
  }

  async completeLogin(
    mfaToken: string,
    code: string,
    context?: { ipAddress?: string; userAgent?: string },
  ) {
    const payload = await this.verifyMfaPendingToken(mfaToken);
    const user = await this.prisma.unscoped.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user || user.status !== 'active' || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException('Invalid MFA session');
    }

    if (!this.verifyCode(user.mfaSecret, code)) {
      await this.safeAuditLog({
        actorUserId: user.id,
        action: 'auth.mfa_verify_failed',
        entityType: 'auth',
        entityId: user.id,
        summary: 'MFA verification failed',
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
      throw new UnauthorizedException('Invalid verification code');
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      fleetOps: isFleetOpsEmail(user.email),
    });

    await this.safeAuditLog({
      actorUserId: user.id,
      action: 'auth.login_success',
      entityType: 'auth',
      entityId: user.id,
      summary: 'User login successful (MFA)',
      metadata: { role: user.role, mfa: true },
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return { user, accessToken };
  }
}
