import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { SetupTenantDto } from '../onboarding/dto/setup-tenant.dto';
import { AuthService } from './auth.service';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { DisableMfaDto } from './dto/disable-mfa.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { VerifyMfaCodeDto } from './dto/verify-mfa-code.dto';
import { VerifyMfaLoginDto } from './dto/verify-mfa-login.dto';
import { OidcExchangeDto } from './dto/oidc-exchange.dto';
import { MfaService } from './mfa.service';
import { OidcService } from './oidc.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly oidc: OidcService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('oidc/config')
  oidcConfig() {
    return this.oidc.getPublicConfig();
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oidc/login')
  async oidcLogin(@Res() res: Response) {
    const url = await this.oidc.buildAuthorizationUrl();
    return res.redirect(url);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('oidc/callback')
  async oidcCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const { redirectUrl } = await this.oidc.handleCallback(code, state, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
    return res.redirect(redirectUrl);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('oidc/exchange')
  @HttpCode(HttpStatus.OK)
  oidcExchange(@Body() dto: OidcExchangeDto) {
    return this.oidc.exchangeCode(dto.code);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }

  @SkipThrottle()
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: AuthenticatedRequest) {
    return this.auth.getById(req.user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  signup(@Body() dto: SetupTenantDto) {
    return this.auth.signup(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('password-reset/forgot')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto.email);
  }

  @SkipThrottle()
  @Post('password-reset/request')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ADMIN_ONLY_ROLES)
  requestPasswordReset(
    @CurrentUser('id') adminUserId: string,
    @Body() dto: RequestPasswordResetDto,
  ) {
    return this.auth.requestPasswordReset(adminUserId, dto.user_id);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('password-reset/validate')
  validatePasswordReset(@Query('token') token?: string) {
    if (!token?.trim()) {
      return { valid: false };
    }
    return this.auth.validatePasswordResetToken(token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.auth.confirmPasswordReset(dto.token, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/verify-login')
  @HttpCode(HttpStatus.OK)
  verifyMfaLogin(@Body() dto: VerifyMfaLoginDto, @Req() req: Request) {
    return this.auth.completeMfaLogin(dto.mfa_token, dto.code, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') ?? undefined,
    });
  }

  @SkipThrottle()
  @Get('mfa/status')
  @UseGuards(JwtAuthGuard)
  mfaStatus(@CurrentUser('id') userId: string) {
    return this.mfa.getStatus(userId);
  }

  @SkipThrottle()
  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  beginMfaSetup(@CurrentUser('id') userId: string) {
    return this.mfa.beginSetup(userId);
  }

  @SkipThrottle()
  @Post('mfa/confirm')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  confirmMfaSetup(@CurrentUser('id') userId: string, @Body() dto: VerifyMfaCodeDto) {
    return this.mfa.confirmSetup(userId, dto.code);
  }

  @SkipThrottle()
  @Post('mfa/disable')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  disableMfa(@CurrentUser('id') userId: string, @Body() dto: DisableMfaDto) {
    return this.mfa.disable(userId, dto.password, dto.code);
  }
}
