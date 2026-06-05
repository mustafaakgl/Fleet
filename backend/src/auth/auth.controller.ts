import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES } from '../common/utils/permissions';
import { AuthService } from './auth.service';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { LoginDto } from './dto/login.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('password-reset/validate')
  validatePasswordReset(@Query('token') token?: string) {
    if (!token?.trim()) {
      return { valid: false };
    }
    return this.auth.validatePasswordResetToken(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  confirmPasswordReset(@Body() dto: ConfirmPasswordResetDto) {
    return this.auth.confirmPasswordReset(dto.token, dto.password);
  }
}
