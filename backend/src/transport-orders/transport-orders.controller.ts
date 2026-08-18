import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RequiresWrite } from '../common/decorators/requires-write.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { DriverBlockGuard } from '../common/guards/driver-block.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { OPERATIONAL_ROLES } from '../common/utils/permissions';
import { AssignmentsService } from '../assignments/assignments.service';
import {
  FinancialFieldForbiddenError,
  assertCanWriteFinancials,
  canSeeOrderFinancials,
  maskOrderFinancials,
  maskOrderList,
} from './core/order-field-security';
import {
  AmendTransportOrderDto,
  CancelTransportOrderDto,
  CreateAssignmentFromOrderDto,
  CreateTransportOrderDto,
  ExpectedUpdatedAtDto,
  LinkAssignmentDto,
  ListTransportOrdersQueryDto,
  RejectAmendmentDto,
} from './dto/transport-order.dto';
import { TransportOrdersService } from './transport-orders.service';

interface AuthenticatedRequest {
  user: { id: string; role?: string };
}

/**
 * TICARI SIPARISLER (Faz 15).
 *
 * ROLLER REPODAN TURETILDI, GENISLETILMEDI:
 *
 *   - `DriverBlockGuard` + `@Roles(...OPERATIONAL_ROLES)` — `assignments`
 *     controller'inin AYNI kombinasyonu. SURUCU (ve musteri) hicbir ticari
 *     siparis ucunu goremez: 403.
 *   - `@RequiresWrite()` — varsayilan yazma rolleri (admin, boss, office).
 *     MUHASEBE OPERASYON PLANINI DEGISTIREMEZ; bu, `assignments`ta zaten
 *     boyle ve gelen siparis ucu bu kisiti GEVSETEMEZ.
 *   - Finansal alanlar (`currency`, `contractedRevenue`, `billingMode`,
 *     `revenueAllocation`) yalnizca `FINANCIAL_ROLES`e acik — OFFICE ne gorur
 *     ne yazar. Koruma SUNUCU YANITINDA: ekranda gizlemek, ayni ucu `curl` ile
 *     cagiran birine hicbir sey yapmaz.
 *
 * Bu ikisinin kesisimi bilincli: office operasyonu yonetir ama fiyati gormez;
 * accounting fiyati yonetir ama plani degistiremez.
 */
@Controller('transport-orders')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class TransportOrdersController {
  constructor(
    private readonly orders: TransportOrdersService,
    private readonly assignments: AssignmentsService,
  ) {}

  /** Yetkisiz finansal yazma denemesini 403'e cevirir — sessizce dusurmez. */
  private guardFinancialWrite(role: string | undefined, input: Record<string, unknown>): void {
    try {
      assertCanWriteFinancials(role, input);
    } catch (error) {
      if (error instanceof FinancialFieldForbiddenError) {
        throw new ForbiddenException({
          code: 'transport_order_financial_field_forbidden',
          fields: error.fields,
        });
      }
      throw error;
    }
  }

  @Get()
  async list(@Query() query: ListTransportOrdersQueryDto, @Req() req: AuthenticatedRequest) {
    const result = await this.orders.list(query);
    return { ...result, rows: maskOrderList(result.rows as Record<string, unknown>[], req.user.role) };
  }

  @Get(':id')
  async detail(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return maskOrderFinancials(await this.orders.detail(id), req.user.role);
  }

  @Get(':id/revisions')
  async revisions(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const rows = await this.orders.revisions(id);
    // Revizyon govdesi eski/yeni TUTARI tasir; maskeleme burada da gecerli.
    return maskOrderList(rows as Record<string, unknown>[], req.user.role);
  }

  /**
   * Manuel taslak.
   *
   * Finansal yetkisi olmayan rol para birimi SECEMEZ; sunucu kiracinin
   * `baseCurrency`sini kullanir. Kodda sabit `EUR` YOK.
   */
  @Post()
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateTransportOrderDto, @Req() req: AuthenticatedRequest) {
    this.guardFinancialWrite(req.user.role, dto as unknown as Record<string, unknown>);

    const currency = canSeeOrderFinancials(req.user.role)
      ? (dto.currency ?? (await this.orders.tenantBaseCurrency()))
      : await this.orders.tenantBaseCurrency();

    const created = await this.orders.createDraft(req.user.id, { ...dto, currency });
    return maskOrderFinancials(created, req.user.role);
  }

  /**
   * Degisiklik.
   *
   * Draft'ta dogrudan uygulanir; ONAYLANMIS sipariste `pending_review` bir
   * revizyon acar ve ana kayit DEGISMEZ.
   */
  @Post(':id/amendments')
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  async amend(
    @Param('id') id: string,
    @Body() dto: AmendTransportOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.guardFinancialWrite(req.user.role, dto as unknown as Record<string, unknown>);
    const { expectedUpdatedAt, ...patch } = dto;
    return maskOrderFinancials(
      await this.orders.amend(req.user.id, id, expectedUpdatedAt, patch),
      req.user.role,
    );
  }

  @Post(':id/amendments/:revisionId/approve')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  async approve(
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: ExpectedUpdatedAtDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return maskOrderFinancials(
      await this.orders.approveAmendment(req.user.id, id, revisionId, dto.expectedUpdatedAt),
      req.user.role,
    );
  }

  /** Red ANA KAYDI DEGISTIRMEZ. */
  @Post(':id/amendments/:revisionId/reject')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @Body() dto: RejectAmendmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return maskOrderFinancials(
      await this.orders.rejectAmendment(req.user.id, id, revisionId, dto.reason),
      req.user.role,
    );
  }

  @Post(':id/confirm')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  async confirm(
    @Param('id') id: string,
    @Body() dto: ExpectedUpdatedAtDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return maskOrderFinancials(
      await this.orders.confirm(req.user.id, id, dto.expectedUpdatedAt),
      req.user.role,
    );
  }

  /** Iptalin operasyona etkisi — YAZMADAN once. */
  @Get(':id/cancellation-impact')
  impact(@Param('id') id: string) {
    return this.orders.cancellationImpact(id);
  }

  @Post(':id/cancel')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelTransportOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return maskOrderFinancials(
      await this.orders.cancel(req.user.id, id, {
        expectedUpdatedAt: dto.expectedUpdatedAt,
        category: dto.category,
        note: dto.note,
        acknowledgeImpact: dto.acknowledgeImpact,
      }),
      req.user.role,
    );
  }

  /**
   * Siparisten GOREV TASLAGI.
   *
   * Gorev MEVCUT `AssignmentsService.create` uzerinden aciliyor: ehliyet
   * uygunlugu, arac arizasi ve cakisma kapilari AYNEN calisiyor. Ikinci bir
   * gorev olusturma yolu acmak, bu kapilari atlamanin yolu olurdu.
   *
   * IDEMPOTENT: ayni (siparis, kalem, surucu, arac, gun) icin ikinci gorev
   * ACILMAZ, var olan doner.
   */
  @Post(':id/assignments')
  @RequiresWrite()
  @HttpCode(HttpStatus.CREATED)
  async createAssignment(
    @Param('id') id: string,
    @Body() dto: CreateAssignmentFromOrderDto,
    @Req() req: AuthenticatedRequest,
  ) {
    this.guardFinancialWrite(req.user.role, {
      // Gelir alani finansal: office bir dilime fiyat YAZAMAZ.
      contractedRevenue: dto.expectedDailyRevenue,
    });

    const order = await this.orders.companyOf(id);
    const workDate = new Date(dto.workDate);

    const existing = await this.orders.findExistingSlice({
      transportOrderId: id,
      consignmentId: dto.consignmentId ?? null,
      driverId: dto.driverId,
      vehicleId: dto.vehicleId,
      workDate,
    });
    if (existing) {
      return { assignmentId: existing.id, created: false };
    }

    const detail = (await this.orders.detail(id)) as {
      consignments: Array<{ id: string; pickupAddress: string; deliveryAddress: string; cargoDescription: string }>;
      company: { name: string };
    };
    const consignment = dto.consignmentId
      ? detail.consignments.find((item) => item.id === dto.consignmentId)
      : detail.consignments[0];

    const created = await this.assignments.create(
      {
        driver_id: dto.driverId,
        vehicle_id: dto.vehicleId,
        company_id: order.companyId,
        cargo_name: consignment?.cargoDescription ?? 'Transport',
        cargo_owner: detail.company.name,
        pickup_address: consignment?.pickupAddress ?? '',
        delivery_address: consignment?.deliveryAddress ?? '',
        work_date: dto.workDate,
        start_time: dto.startTime,
        end_time: dto.endTime,
        expected_daily_revenue: dto.expectedDailyRevenue ?? undefined,
        // Kapilar AYNEN calisiyor; onay yalnizca ILETILIYOR.
        acknowledge_license_compliance_warning: dto.acknowledgeLicenseComplianceWarning,
        acknowledge_vehicle_defect_warning: dto.acknowledgeVehicleDefectWarning,
      } as never,
      req.user.id,
    );

    const assignmentId = (created as { id: string }).id;
    await this.orders.attachAssignment(req.user.id, id, assignmentId, dto.consignmentId ?? null);
    return { assignmentId, created: true };
  }

  /** Eski bir gorevi siparise baglar. Bir gorev YALNIZ BIR siparise ait olur. */
  @Post(':id/assignments/link')
  @RequiresWrite()
  @HttpCode(HttpStatus.OK)
  async link(
    @Param('id') id: string,
    @Body() dto: LinkAssignmentDto,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.orders.attachAssignment(
      req.user.id,
      id,
      dto.assignmentId,
      dto.consignmentId ?? null,
    );
    return maskOrderFinancials(await this.orders.detail(id), req.user.role);
  }
}
