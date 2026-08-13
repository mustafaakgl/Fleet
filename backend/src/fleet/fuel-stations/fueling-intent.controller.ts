import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SelectFuelingIntentDto } from './dto/select-fueling-intent.dto';
import { FuelingIntentService } from './fueling-intent.service';

/**
 * Surucunun gecici yakit duragi ucu.
 *
 * Tekil kaynak yolu (`/active`) bilincli: bir surucunun ayni anda EN FAZLA BIR
 * aktif yakit duragi olur, dolayisiyla adreslenecek bir liste ve bir kimlik
 * yok. `:id` alan bir uc, surucunun baskasinin kaydini adreslemeyi denemesine
 * kapi acardi; burada boyle bir kapi hic acilmiyor — kayit her zaman
 * oturumdaki surucuden cozuluyor.
 *
 * Is mantigi controller'da DEGIL: FuelingIntentService'te.
 */
@Controller('driver/fueling-intents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('driver')
export class FuelingIntentDriverController {
  constructor(private readonly intents: FuelingIntentService) {}

  /** Aktif niyet yoksa `{ intent: null }` — NORMAL durum, 404 degil. */
  @Get('active')
  active(@CurrentUser('id') userId: string) {
    return this.intents.getActive(userId);
  }

  /**
   * Yakit duragini secer ya da degistirir.
   *
   * PUT: kaynak tekil ve istek TEKRARLANABILIR. Ayni secim ikinci kez
   * gonderildiginde yeni kayit URETILMEZ (bkz. SelectFuelingIntentDto ve
   * FuelingIntentService.applySelection).
   */
  @Put('active')
  select(@CurrentUser('id') userId: string, @Body() dto: SelectFuelingIntentDto) {
    return this.intents.select(userId, dto);
  }

  /** Tekrarlanan iptal guvenlidir: aktif kayit yoksa da 200 doner. */
  @Post('active/cancel')
  @HttpCode(200)
  cancel(@CurrentUser('id') userId: string) {
    return this.intents.cancel(userId);
  }

  /**
   * Harici navigasyonun ACILDIGI ani kaydeder. Varis ya da yakit alma kaniti
   * DEGIL; arayuz bu cagri basarisiz olsa bile navigasyonu acar.
   */
  @Post('active/navigation-opened')
  @HttpCode(200)
  navigationOpened(@CurrentUser('id') userId: string) {
    return this.intents.markNavigationOpened(userId);
  }
}
