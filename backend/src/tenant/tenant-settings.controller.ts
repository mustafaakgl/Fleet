import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ADMIN_ONLY_ROLES, FINANCIAL_ROLES } from '../common/utils/permissions';
import { TenantSettingsService } from './tenant-settings.service';

export class SetBaseCurrencyDto {
  /** ISO-4217, uc harf. Dogrulama servis katmaninda da tekrarlaniyor. */
  @IsString()
  @Length(3, 3)
  baseCurrency!: string;
}

/**
 * Kiracinin mali ayarlari.
 *
 * OKUMA: FINANCIAL_ROLES (admin, boss, accounting) — muhasebe hangi para
 * biriminde calistigini GORMELI. `office` disarida: mali ayar onun isi degil.
 *
 * YAZMA: yalnizca admin ve boss. `accounting` okur ama DEGISTIREMEZ — temel
 * para birimini degistirmek gecmis tutarlarin anlamini degistiren bir karardir
 * ve muhasebecinin gunluk yetkisi olmamali.
 */
@Controller('tenant/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCIAL_ROLES)
export class TenantSettingsController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Get('currency')
  getCurrency() {
    return this.settings.getCurrencySettings();
  }

  /**
   * Temel para birimini degistirir.
   *
   * Kiracida parasal kayit varsa 409 `tenant_base_currency_locked` doner:
   * eski tutarlarin uzerine yeni etiket yapistirmak sessiz bir veri
   * bozulmasidir.
   */
  @Put('currency')
  @Roles('admin', 'boss')
  setCurrency(@CurrentUser('id') userId: string, @Body() dto: SetBaseCurrencyDto) {
    return this.settings.setBaseCurrency(userId, dto.baseCurrency);
  }
}
