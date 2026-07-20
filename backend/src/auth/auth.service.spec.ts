import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import type { AuditService } from '../audit/audit.service';
import type { MailService } from '../mail/mail.service';
import type { OnboardingService } from '../onboarding/onboarding.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TenantAccessService } from '../tenant/tenant-access.service';
import type { MfaService } from './mfa.service';

describe('AuthService refresh token reuse', () => {
  it('revokes active replacement tokens when a rotated body token is reused', async () => {
    const revokedAtValues: Date[] = [];
    const prisma = {
      unscoped: {
        refreshToken: {
          findUnique: async () => ({
            id: 'old-token',
            userId: 'user-1',
            tokenHash: 'hash',
            replacedById: 'replacement-token',
            revokedAt: new Date('2026-07-20T00:00:00.000Z'),
            expiresAt: new Date('2026-07-21T00:00:00.000Z'),
            ipAddress: null,
            userAgent: null,
            createdAt: new Date('2026-07-20T00:00:00.000Z'),
            user: null,
          }),
          updateMany: async (args: { where: { userId: string; revokedAt: null }; data: { revokedAt: Date } }) => {
            assert.deepEqual(args.where, { userId: 'user-1', revokedAt: null });
            revokedAtValues.push(args.data.revokedAt);
            return { count: 1 };
          },
        },
      },
    } as unknown as PrismaService;

    const service = new AuthService(
      prisma,
      new JwtService({ secret: 'qa-test-secret' }),
      new ConfigService({ JWT_SECRET: 'qa-test-secret' }),
      { logAction: async () => undefined } as unknown as AuditService,
      {} as MailService,
      {} as OnboardingService,
      {} as MfaService,
      {} as TenantAccessService,
    );

    await assert.rejects(
      service.refreshTokens('reused-token'),
      /Refresh token reuse detected/,
    );
    assert.equal(revokedAtValues.length, 1);
  });
});