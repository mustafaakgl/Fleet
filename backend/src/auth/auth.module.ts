import { Module } from '@nestjs/common';
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

@Module({
  imports: [
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
  providers: [AuthService, MfaService, OidcService, JwtStrategy],
  exports: [AuthService, MfaService, OidcService],
})
export class AuthModule {}
