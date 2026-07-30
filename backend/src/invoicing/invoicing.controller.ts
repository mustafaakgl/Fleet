import { Body, Controller, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Readable } from 'node:stream';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FINANCIAL_ROLES } from '../common/utils/permissions';
import { CreateInvoiceDraftDto } from './dto/create-invoice-draft.dto';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { UpsertBillingProfileDto } from './dto/upsert-billing-profile.dto';
import { InvoicingService } from './invoicing.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string; tenantId: string };
}

@Controller('invoicing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...FINANCIAL_ROLES)
export class InvoicingController {
  constructor(private readonly invoicing: InvoicingService) {}

  @Get('billing-profile')
  getBillingProfile() {
    return this.invoicing.getBillingProfile();
  }

  @Put('billing-profile')
  @RequiresWrite()
  upsertBillingProfile(
    @Body() dto: UpsertBillingProfileDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.upsertBillingProfile(request.user.tenantId, dto, request.user.id);
  }

  @Get('uninvoiced')
  listUninvoiced(@Query('from') from?: string, @Query('to') to?: string) {
    return this.invoicing.listUninvoiced(from, to);
  }

  @Get('open-overdue')
  listOpenOverdue(@Query('asOf') asOf?: string) {
    return this.invoicing.listOpenOverdue(asOf);
  }

  @Post('invoices')
  @RequiresWrite()
  createDraft(
    @Body() dto: CreateInvoiceDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.createDraft(dto, request.user.id);
  }

  @Get('invoices')
  listInvoices(
    @Query('status') status?: string,
    @Query('companyId') companyId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.invoicing.listInvoices({ status, companyId, from, to });
  }

  @Get('invoices/summary/by-company')
  invoiceSummaryByCompany(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('groupBy') groupBy?: string,
    @Query('status') status?: string,
  ) {
    return this.invoicing.invoiceSummaryByCompany({ from, to, groupBy, status });
  }

  @Get('invoices/:id')
  getInvoice(@Param('id') id: string) {
    return this.invoicing.getInvoice(id);
  }

  @Patch('invoices/:id')
  @RequiresWrite()
  updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.updateDraft(id, dto, request.user.id);
  }

  @Post('invoices/:id/finalize')
  @RequiresWrite()
  finalizeInvoice(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.invoicing.finalizeInvoice(id, request.user.tenantId, request.user.id);
  }

  @Post('invoices/:id/send')
  @RequiresWrite()
  sendInvoice(
    @Param('id') id: string,
    @Body() dto: SendInvoiceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.sendInvoice(id, request.user.tenantId, request.user.id, dto);
  }

  @Get('invoices/:id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() response: Response) {
    const file = await this.invoicing.downloadInvoiceDocument(id, 'pdf');
    this.sendStoredDocument(response, file);
  }

  @Get('invoices/:id/xml')
  async downloadXml(
    @Param('id') id: string,
    @Res() response: Response,
    @Query('format') format?: string,
  ) {
    const file = await this.invoicing.downloadInvoiceDocument(id, 'xml', format);
    this.sendStoredDocument(response, file);
  }

  private sendStoredDocument(
    response: Response,
    file: { stream: Readable; fileName: string; mimeType: string },
  ): void {
    response.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.fileName)}"`,
      'Cache-Control': 'private, no-store',
    });
    file.stream.pipe(response);
  }
}
