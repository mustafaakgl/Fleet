import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import {
  canViewFinancialFields,
  CSV_IMPORT_ROLES,
  FINANCIAL_ROLES,
  maskFinancialFields,
  OPERATIONAL_ROLES,
} from '../common/utils/permissions';
import { ServiceRecordsService } from './service-records.service';
import { CreateServiceRecordDto } from './dto/create-service-record.dto';
import { ReviewServiceRecordDto } from './dto/review-service-record.dto';
import { UpdateServiceRecordDto } from './dto/update-service-record.dto';

@Controller('service-records')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class ServiceRecordsController {
  constructor(private readonly serviceRecords: ServiceRecordsService) {}

  @Get()
  list(
    @Query('vehicle_id') vehicle_id?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('repair_company') repair_company?: string,
    @Query('approval_status') approval_status?: string,
    @CurrentUser('role') role?: string,
  ) {
    return this.serviceRecords
      .list({ vehicle_id, from, to, repair_company, approval_status })
      .then((data) => maskFinancialFields(data, role));
  }

  @Get('repair-companies')
  repairCompanies() {
    return this.serviceRecords.getRepairCompanies();
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser('role') role?: string) {
    return this.serviceRecords.getById(id).then((data) => maskFinancialFields(data, role));
  }

  @Post('import')
  @Roles(...CSV_IMPORT_ROLES)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @UploadedFile() file: { buffer: Buffer },
    @CurrentUser('id') actorUserId?: string,
  ) {
    const content = file?.buffer?.toString('utf8') ?? '';
    return this.serviceRecords.importFromCsv(content, actorUserId);
  }

  @Post()
  @RequiresWrite('accounting')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateServiceRecordDto,
    @CurrentUser('role') role?: string,
    @CurrentUser('id') actorUserId?: string,
  ) {
    if (!canViewFinancialFields(role) && dto.cost_amount !== undefined) {
      throw new ForbiddenException('You do not have permission to set service cost');
    }
    return this.serviceRecords.create(dto, actorUserId).then((data) => maskFinancialFields(data, role));
  }

  @Patch(':id')
  @RequiresWrite('accounting')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceRecordDto,
    @CurrentUser('role') role?: string,
    @CurrentUser('id') actorUserId?: string,
  ) {
    if (!canViewFinancialFields(role) && dto.cost_amount !== undefined) {
      throw new ForbiddenException('You do not have permission to update service cost');
    }
    return this.serviceRecords.update(id, dto, actorUserId).then((data) => maskFinancialFields(data, role));
  }

  /**
   * Muhasebe onayi / reddi (Faz 18B).
   *
   * `FINANCIAL_ROLES`: office BILINCLI OLARAK DISARIDA. Office servis kaydi
   * acabilir ama tutarini gormedigi bir gideri muhasebe toplamina sokamaz.
   */
  @Post(':id/review')
  @Roles(...FINANCIAL_ROLES)
  @RequiresWrite('accounting')
  @HttpCode(HttpStatus.OK)
  review(
    @Param('id') id: string,
    @Body() dto: ReviewServiceRecordDto,
    @CurrentUser('role') role?: string,
    @CurrentUser('id') actorUserId?: string,
  ) {
    return this.serviceRecords
      .review(id, dto, actorUserId)
      .then((data) => maskFinancialFields(data, role));
  }

  @Delete(':id')
  @RequiresWrite()
  remove(@Param('id') id: string, @CurrentUser('id') actorUserId?: string) {
    return this.serviceRecords.remove(id, actorUserId);
  }
}
