import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FINANCIAL_ROLES } from '../common/utils/permissions';
import { FinanceSummaryQueryDto } from './dto/finance-summary.query';
import { FinanceSummaryService } from './finance-summary.service';

/**
 * Finance merkezi (Faz 18C).
 *
 * `@Roles(...FINANCIAL_ROLES)` CONTROLLER seviyesinde: office, driver ve
 * customer bu ucun HICBIR alanini alamiyor — maskeleme degil, cevabin kendisi
 * yok. Finansal veriyi istemcide gizlemek yeterli degildir; gizlenen bir alan
 * ag sekmesinde hala okunur.
 *
 * `INVOICING_ROLES` KULLANILMADI ve bu bilincli: o grup office'i iceriyor
 * cunku office fatura kesiyor. Bu ekran gider, marj ve ihtilafli ceza
 * gosteriyor — office'in gormedigi seyler.
 */
@Controller('finance')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...FINANCIAL_ROLES)
export class FinanceController {
  constructor(private readonly financeSummary: FinanceSummaryService) {}

  @Get('summary')
  getSummary(@Query() query: FinanceSummaryQueryDto) {
    return this.financeSummary.getSummary(query);
  }
}
