import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { getFrontendUrl } from '../config/env.validation';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
};

type OidcStatePayload = {
  typ: 'oidc_state';
  nonce: string;
};

@Injectable()
export class OidcService {
  private discoveryCache: { value: OidcDiscovery; expiresAt: number } | null = null;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  isEnabled(): boolean {
    return (process.env.SSO_OIDC_ENABLED ?? '').toLowerCase() === 'true';
  }

  getPublicConfig() {
    return {
      enabled: this.isEnabled(),
      label: process.env.SSO_OIDC_BUTTON_LABEL?.trim() || 'Sign in with SSO',
    };
  }

  private requireConfig() {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('SSO is not enabled');
    }

    const issuer = process.env.SSO_OIDC_ISSUER?.trim();
    const clientId = process.env.SSO_OIDC_CLIENT_ID?.trim();
    const clientSecret = process.env.SSO_OIDC_CLIENT_SECRET?.trim();
    const redirectUri =
      process.env.SSO_OIDC_REDIRECT_URI?.trim() ||
      `${process.env.API_PUBLIC_URL?.trim() || 'http://localhost:3000'}/api/v1/auth/oidc/callback`;

    if (!issuer || !clientId || !clientSecret) {
      throw new ServiceUnavailableException('SSO OIDC is misconfigured');
    }

    return { issuer: issuer.replace(/\/$/, ''), clientId, clientSecret, redirectUri };
  }

  private async getDiscovery(): Promise<OidcDiscovery> {
    const now = Date.now();
    if (this.discoveryCache && this.discoveryCache.expiresAt > now) {
      return this.discoveryCache.value;
    }

    const { issuer } = this.requireConfig();
    const response = await fetch(`${issuer}/.well-known/openid-configuration`);
    if (!response.ok) {
      throw new ServiceUnavailableException('OIDC discovery failed');
    }

    const discovery = (await response.json()) as OidcDiscovery;
    this.discoveryCache = { value: discovery, expiresAt: now + 60 * 60 * 1000 };
    return discovery;
  }

  async buildAuthorizationUrl(): Promise<string> {
    const { clientId, redirectUri } = this.requireConfig();
    const discovery = await this.getDiscovery();
    const nonce = randomBytes(16).toString('hex');
    const state = await this.jwt.signAsync(
      { typ: 'oidc_state', nonce } satisfies OidcStatePayload,
      { expiresIn: '10m' },
    );

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: process.env.SSO_OIDC_SCOPES?.trim() || 'openid email profile',
      state,
      nonce,
    });

    return `${discovery.authorization_endpoint}?${params.toString()}`;
  }

  async handleCallback(
    code: string | undefined,
    state: string | undefined,
    context?: { ipAddress?: string; userAgent?: string },
  ): Promise<{ redirectUrl: string }> {
    if (!code || !state) {
      throw new BadRequestException('Missing OIDC callback parameters');
    }

    let statePayload: OidcStatePayload;
    try {
      statePayload = await this.jwt.verifyAsync<OidcStatePayload>(state);
      if (statePayload.typ !== 'oidc_state') {
        throw new UnauthorizedException('Invalid OIDC state');
      }
    } catch {
      throw new UnauthorizedException('Invalid or expired OIDC state');
    }

    const { clientId, clientSecret, redirectUri } = this.requireConfig();
    const discovery = await this.getDiscovery();

    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedException('OIDC token exchange failed');
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      id_token?: string;
    };

    let email: string | undefined;
    if (discovery.userinfo_endpoint && tokenData.access_token) {
      const userinfoResponse = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoResponse.ok) {
        const userinfo = (await userinfoResponse.json()) as { email?: string };
        email = userinfo.email?.trim().toLowerCase();
      }
    }

    if (!email && tokenData.id_token) {
      const payloadPart = tokenData.id_token.split('.')[1];
      if (payloadPart) {
        const decoded = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
          email?: string;
        };
        email = decoded.email?.trim().toLowerCase();
      }
    }

    if (!email) {
      throw new UnauthorizedException('OIDC provider did not return an email address');
    }

    const allowedRoles = (process.env.SSO_OIDC_ALLOWED_ROLES ?? 'admin,boss,office,accounting')
      .split(',')
      .map((role) => role.trim())
      .filter(Boolean);

    const user = await this.prisma.unscoped.user.findFirst({
      where: {
        email,
        status: 'active',
        role: { in: allowedRoles as UserRole[] },
      },
    });

    if (!user) {
      throw new UnauthorizedException('No active Fleet account for this SSO identity');
    }

    const session = await this.auth.issueSessionForUser(user.id, {
      method: 'oidc',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    const frontend = getFrontendUrl().replace(/\/$/, '');
    const redirectUrl = `${frontend}/login/callback?access_token=${encodeURIComponent(session.accessToken)}`;
    return { redirectUrl };
  }
}
