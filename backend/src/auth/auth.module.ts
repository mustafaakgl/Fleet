import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { getJwtExpiresIn, getJwtSecret } from '../config/env.validation';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { MfaService } from './mfa.service';
import { OidcService } from './oidc.service';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditModule,
    MailModule,
    OnboardingModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: getJwtExpiresIn() as `${number}h` },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MfaService, OidcService, RefreshTokenService, JwtStrategy],
  exports: [AuthService, MfaService, OidcService, RefreshTokenService],
})
export class AuthModule {}
