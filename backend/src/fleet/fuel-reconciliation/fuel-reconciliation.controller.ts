import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FINANCIAL_ROLES } from '../../common/utils/permissions';
import {
  ListFuelReconciliationsQueryDto,
  ReviewFuelReconciliationDto,
} from './dto/fuel-reconciliation.dto';
import { FuelReconciliationReviewService } from './fuel-reconciliation-review.service';

/**
 * Yakit fisi / telematik mutabakati — muhasebe ucu.
 *
 * ROL: `FINANCIAL_ROLES` (admin, boss, accounting) — yakit fisi incelemesiyle
 * BIREBIR AYNI. `office` bilincli olarak DISARIDA: bu uc mali bir risk
 * degerlendirmesi tasiyor ve ofisin gorevine girmiyor. Menuyu gizlemek tek
 * basina guvenlik degildir; dogrudan URL yazsa bile RolesGuard reddeder.
 *
 * `driver` da disarida: surucu kendi ucunden yalnizca "fisiniz inceleniyor"
 * bilgisini gorur — risk seviyesi, puan, kural adlari ve inceleme notu bu
 * ucun arkasinda kalir.
 */
@Controller('fleet/fuel-reconciliations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCIAL_ROLES)
export class FuelReconciliationController {
  constructor(private readonly review: FuelReconciliationReviewService) {}

  @Get()
  list(@Query() query: ListFuelReconciliationsQueryDto) {
    return this.review.list(query);
  }

  /**
   * Arac maliyetleri ekranindaki "kontrol bekleyen" rakami.
   *
   * `:id`'den ONCE tanimli olmali — aksi halde `summary` bir kimlik gibi
   * yorumlanir ve bu uc hic calismaz.
   */
  @Get('summary')
  summary(@Query('vehicleId') vehicleId?: string) {
    return this.review.openSummary(vehicleId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.review.detail(id);
  }

  /**
   * Inceleme karari. `expectedUpdatedAt` ZORUNLU: iki muhasebeci ayni kaydi
   * ayni anda farkli sonuclarla kapatamasin.
   */
  @Post(':id/review')
  @HttpCode(200)
  reviewDecision(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: ReviewFuelReconciliationDto,
  ) {
    return this.review.review(userId, id, dto);
  }
}
