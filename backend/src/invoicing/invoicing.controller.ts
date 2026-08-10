import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Readable } from 'node:stream';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { FINANCIAL_ROLES, INVOICING_ROLES } from '../common/utils/permissions';
import { CreateInvoicePaymentDto } from './dto/create-invoice-payment.dto';
import { CreateInvoiceDraftDto, ManualInvoiceLineDto } from './dto/create-invoice-draft.dto';
import { SendInvoiceDto } from './dto/send-invoice.dto';
import { UpdateInvoiceDraftDto } from './dto/update-invoice-draft.dto';
import { UpdateInvoiceLineDto } from './dto/update-invoice-line.dto';
import { UpsertBillingProfileDto } from './dto/upsert-billing-profile.dto';
import { InvoicingService } from './invoicing.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string; tenantId: string };
}

/**
 * Faturalama uclari.
 *
 * Okuma FINANCIAL_ROLES (admin, patron, muhasebe). Yazma icin
 * `RequiresWrite('accounting')` gerekiyor: global yazma listesi (admin, patron,
 * office) muhasebeyi DISLIYOR, yani muhasebeci fatura kesemiyordu. Genisletme
 * uc bazinda — muhasebeye baska modullerde yazma hakki vermiyor. Office artik giden
 * faturalari gorup kesebiliyor (INVOICING_ROLES); sirketin kendi banka/vergi
 * bilgileri, DATEV ihracati ve odeme silme uc bazinda FINANCIAL_ROLES'te
 * kaldi — office'in fatura kesmesi gerekiyor, sirketin IBAN'ini degistirmesi
 * gerekmiyor.
 */
@Controller('invoicing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...INVOICING_ROLES)
export class InvoicingController {
  constructor(private readonly invoicing: InvoicingService) {}

  @Roles(...FINANCIAL_ROLES)
  @Get('billing-profile')
  getBillingProfile() {
    return this.invoicing.getBillingProfile();
  }

  @Roles(...FINANCIAL_ROLES)
  @Put('billing-profile')
  @RequiresWrite('accounting')
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
  @RequiresWrite('accounting')
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
  @RequiresWrite('accounting')
  updateDraft(
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDraftDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.updateDraft(id, dto, request.user.id);
  }

  @Post('invoices/:id/lines')
  @RequiresWrite('accounting')
  addDraftLine(
    @Param('id') id: string,
    @Body() dto: ManualInvoiceLineDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.addDraftLine(id, dto, request.user.id);
  }

  @Patch('invoices/:id/lines/:lineId')
  @RequiresWrite('accounting')
  updateDraftLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateInvoiceLineDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.updateDraftLine(id, lineId, dto, request.user.id);
  }

  @Delete('invoices/:id/lines/:lineId')
  @RequiresWrite('accounting')
  deleteDraftLine(
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.deleteDraftLine(id, lineId, request.user.id);
  }

  @Post('invoices/:id/finalize')
  @RequiresWrite('accounting')
  finalizeInvoice(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.invoicing.finalizeInvoice(id, request.user.tenantId, request.user.id);
  }

  @Post('invoices/:id/send')
  @RequiresWrite('accounting')
  sendInvoice(
    @Param('id') id: string,
    @Body() dto: SendInvoiceDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.sendInvoice(id, request.user.tenantId, request.user.id, dto);
  }

  @Post('invoices/:id/payments')
  @RequiresWrite('accounting')
  addPayment(
    @Param('id') id: string,
    @Body() dto: CreateInvoicePaymentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.recordPayment(id, request.user.tenantId, request.user.id, dto);
  }

  @Roles(...FINANCIAL_ROLES)
  @Delete('payments/:id')
  @RequiresWrite('accounting')
  deletePayment(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.invoicing.deletePayment(id, request.user.tenantId, request.user.id);
  }

  @Roles(...FINANCIAL_ROLES)
  @Get('datev/export')
  @RequiresWrite('accounting')
  exportDatev(
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.invoicing.exportDatev(from, to, request.user.tenantId, request.user.id);
  }

  @Roles(...FINANCIAL_ROLES)
  @Get('datev/exports/:id/download')
  async downloadDatevExport(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ) {
    const file = await this.invoicing.downloadDatevExport(id, request.user.tenantId);
    this.sendStoredDocument(response, file);
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
