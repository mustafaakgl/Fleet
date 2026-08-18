import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AUTOMATION_ROLES } from '../common/utils/permissions';
import { CreateEnrollmentDto } from './dto/ordivan.dto';
import { OrdivanConnectorService } from './ordivan-connector.service';
import {
  CURRENT_PROTOCOL_VERSION,
  MIN_SUPPORTED_PROTOCOL_VERSION,
  resolveOrdivanMode,
} from './ordivan.config';

/**
 * Connector yonetimi (Faz 12).
 *
 * ROL: `AUTOMATION_ROLES` (admin, boss). Bu uc bir makineye KIRACI CAPINDA
 * yetki veren enrollment kodu uretiyor; accounting ve office disarida.
 *
 * DUZ METIN SECRET yalnizca uretildigi ANDA, bir kez doner. Liste ucu ne
 * anahtari ne de ozetini ICERIR.
 */
@Controller('ordivan/connectors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AUTOMATION_ROLES)
export class OrdivanAdminController {
  constructor(private readonly connectors: OrdivanConnectorService) {}

  @Get()
  async list() {
    return {
      mode: resolveOrdivanMode(),
      protocol: {
        current: CURRENT_PROTOCOL_VERSION,
        minimumSupported: MIN_SUPPORTED_PROTOCOL_VERSION,
      },
      connectors: await this.connectors.list(),
    };
  }

  /** Tek kullanimlik, kisa omurlu enrollment kodu. Kod BIR KEZ doner. */
  @Post('enrollments')
  @HttpCode(201)
  createEnrollment(@CurrentUser('id') userId: string, @Body() dto: CreateEnrollmentDto) {
    return this.connectors.createEnrollment(userId, {
      displayName: dto.displayName,
      capabilities: dto.capabilities,
    });
  }

  /** Anahtari yeniler; eski anahtar ANINDA gecersiz olur. */
  @Post(':id/rotate')
  @HttpCode(200)
  rotate(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.connectors.rotateCredential(userId, id);
  }

  /** Iptal. Kayit silinmez, yalnizca anahtar duser. */
  @Post(':id/revoke')
  @HttpCode(200)
  async revoke(@CurrentUser('id') userId: string, @Param('id') id: string) {
    await this.connectors.revoke(userId, id);
    return { revoked: true };
  }
}
