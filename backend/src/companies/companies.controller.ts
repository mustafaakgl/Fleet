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
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { canViewFinancialFields, maskFinancialFields, OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

@Controller('companies')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  list(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentUser('role') role?: string,
  ) {
    return this.companies.list({
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    }).then((data) => maskFinancialFields(data, role));
  }

  @Get(':id')
  getOne(@Param('id') id: string, @CurrentUser('role') role?: string) {
    return this.companies.getById(id).then((data) => maskFinancialFields(data, role));
  }

  @Post()
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateCompanyDto,
    @CurrentUser('role') role?: string,
    @CurrentUser('id') actorUserId?: string,
  ) {
    if (!canViewFinancialFields(role) && dto.default_daily_revenue !== undefined) {
      throw new ForbiddenException('You do not have permission to set default daily revenue');
    }
    return this.companies.create(dto, actorUserId).then((data) => maskFinancialFields(data, role));
  }

  @Patch(':id')
  @RequiresWrite()
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser('role') role?: string,
    @CurrentUser('id') actorUserId?: string,
  ) {
    if (!canViewFinancialFields(role) && dto.default_daily_revenue !== undefined) {
      throw new ForbiddenException('You do not have permission to update default daily revenue');
    }
    return this.companies.update(id, dto, actorUserId).then((data) => maskFinancialFields(data, role));
  }

  @Delete(':id')
  @RequiresWrite()
  remove(@Param('id') id: string, @CurrentUser('id') actorUserId: string) {
    return this.companies.remove(id, actorUserId);
  }

  @Get(':id/assignments')
  getAssignments(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: string,
  ) {
    return this.companies.getAssignments(id, { from, to, status });
  }

  @Get(':id/email-history')
  getEmailHistory(@Param('id') id: string, @Query('status') status?: string) {
    return this.companies.getEmailHistory(id, { status });
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string) {
    return this.companies.getStats(id);
  }
}
