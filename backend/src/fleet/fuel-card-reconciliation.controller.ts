import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { ListFuelCardTransactionsQueryDto } from './dto/list-fuel-card-transactions.query';
import { FuelCardReconciliationService } from './fuel-card-reconciliation.service';

@Controller('fleet/fuel-card')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class FuelCardReconciliationController {
  constructor(private readonly fuelCardReconciliation: FuelCardReconciliationService) {}

  @Get('import-batches')
  listImportBatches() {
    return this.fuelCardReconciliation.listImportBatches();
  }

  @Get('import-batches/:batchId')
  getImportBatch(@Param('batchId') batchId: string) {
    return this.fuelCardReconciliation.getBatchById(batchId);
  }

  @Get('transactions')
  listTransactions(@Query() query: ListFuelCardTransactionsQueryDto) {
    return this.fuelCardReconciliation.listTransactions(query);
  }
}
