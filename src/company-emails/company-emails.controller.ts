import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { CompanyEmailsService } from './company-emails.service';
import { UpdateCompanyEmailDto } from './dto/update-company-email.dto';

@Controller('company-emails')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class CompanyEmailsController {
  constructor(private readonly companyEmailsService: CompanyEmailsService) {}

  @Get()
  listCompanyEmails(
    @Query('companyId') companyId?: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
  ) {
    return this.companyEmailsService.listCompanyEmails({
      companyId,
      date,
      status,
    });
  }

  @Get(':id')
  getCompanyEmailById(@Param('id') id: string) {
    return this.companyEmailsService.getCompanyEmailById(id);
  }

  @Post('generate')
  generateDraftForCompany(@Body() body: { date: string; companyId: string }) {
    return this.companyEmailsService.generateDraftForCompany(body.date, body.companyId);
  }

  @Post('generate-for-date')
  generateDraftsForDate(@Body() body: { date: string }) {
    return this.companyEmailsService.generateDraftsForDate(body.date);
  }

  @Patch(':id')
  updateDraft(@Param('id') id: string, @Body() body: UpdateCompanyEmailDto) {
    return this.companyEmailsService.updateDraft(id, body);
  }

  @Post(':id/mark-draft-ready')
  markAsDraftReady(@Param('id') id: string) {
    return this.companyEmailsService.markAsDraftReady(id);
  }

  @Post(':id/mark-sent')
  markAsSent(@Param('id') id: string) {
    return this.companyEmailsService.markAsSent(id);
  }

  @Post(':id/mark-failed')
  markAsFailed(@Param('id') id: string) {
    return this.companyEmailsService.markAsFailed(id);
  }
}
