import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
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
  generateDraftForCompany(
    @Body() body: { date: string; companyId: string },
    @CurrentUser('id') currentUserId?: string,
  ) {
    return this.companyEmailsService.generateDraftForCompany(body.date, body.companyId, currentUserId);
  }

  @Post('generate-for-date')
  generateDraftsForDate(@Body() body: { date: string }, @CurrentUser('id') currentUserId?: string) {
    return this.companyEmailsService.generateDraftsForDate(body.date, currentUserId);
  }

  @Patch(':id')
  updateDraft(
    @Param('id') id: string,
    @Body() body: UpdateCompanyEmailDto,
    @CurrentUser('id') currentUserId?: string,
  ) {
    return this.companyEmailsService.updateDraft(id, body, currentUserId);
  }

  @Post(':id/mark-draft-ready')
  markAsDraftReady(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
    return this.companyEmailsService.markAsDraftReady(id, currentUserId);
  }

  @Post(':id/send')
  sendEmail(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
    return this.companyEmailsService.sendEmail(id, currentUserId);
  }

  @Post(':id/mark-sent')
  markAsSent(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
    return this.companyEmailsService.markAsSent(id, currentUserId);
  }

  @Post(':id/mark-failed')
  markAsFailed(@Param('id') id: string, @CurrentUser('id') currentUserId?: string) {
    return this.companyEmailsService.markAsFailed(id, currentUserId);
  }
}
