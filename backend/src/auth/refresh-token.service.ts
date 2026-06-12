import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export const REFRESH_COOKIE_NAME = 'fleet_refresh_token';

const DEFAULT_REFRESH_TTL_DAYS = 30;

function getRefreshTtlMs(): number {
  const days = Number(process.env.REFRESH_TOKEN_TTL_DAYS);
  const ttlDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_REFRESH_TTL_DAYS;
  return ttlDays * 24 * 60 * 60 * 1000;
}

function isSecureCookies(): boolean {
  if ((process.env.COOKIE_SECURE ?? '').toLowerCase() === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

export function refreshCookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookies(),
    sameSite: 'lax',
    path: '/api/v1/auth',
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Issues a new refresh token for the user and returns the raw token. */
  async issue(
    userId: string,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + getRefreshTtlMs());

    await this.prisma.unscoped.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(token),
        expiresAt,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      },
    });

    return { token, expiresAt };
  }

  /**
   * Validates and rotates a refresh token. Revokes the old one and issues a
   * replacement. Reuse of an already-rotated token revokes the whole chain
   * for that user (possible token theft).
   */
  async rotate(
    rawToken: string,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ userId: string; token: string; expiresAt: Date }> {
    const tokenHash = this.hash(rawToken);
    const existing = await this.prisma.unscoped.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      // Token reuse after rotation — revoke all active tokens for this user.
      await this.revokeAllForUser(existing.userId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const replacement = await this.issue(existing.userId, context);
    const replacementHash = this.hash(replacement.token);
    const replacementRecord = await this.prisma.unscoped.refreshToken.findUnique({
      where: { tokenHash: replacementHash },
      select: { id: true },
    });

    await this.prisma.unscoped.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedById: replacementRecord?.id },
    });

    return { userId: existing.userId, ...replacement };
  }

  async revoke(rawToken: string): Promise<void> {
    const tokenHash = this.hash(rawToken);
    await this.prisma.unscoped.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.unscoped.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Removes expired/revoked tokens older than 60 days. Safe to call opportunistically. */
  async pruneStale(): Promise<void> {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await this.prisma.unscoped.refreshToken.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
      },
    });
  }

  setCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(REFRESH_COOKIE_NAME, token, refreshCookieOptions(expiresAt.getTime() - Date.now()));
  }

  clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  }
}
