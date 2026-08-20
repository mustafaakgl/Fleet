import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { DispatchApprovalService } from './dispatch-approval.service';
import { DispatchReadService } from './dispatch-read.service';
import { DispatchService } from './dispatch.service';
import {
  ApproveDispatchDto,
  CreateDispatchProposalDto,
  ListDispatchProposalsQueryDto,
  RejectDispatchDto,
} from './dto/dispatch.dto';

interface AuthenticatedRequest {
  user: { id: string; role?: string };
}

/**
 * DISPATCH — OPERASYON KUYRUGU (Faz 17f).
 *
 * ROLLER REPODAN TURETILDI, YENI BIR ROL SISTEMI KURULMADI. Kombinasyon
 * `transport-orders` ve `order-intake` ile AYNI:
 *
 *   - `DriverBlockGuard` + `@Roles(...OPERATIONAL_ROLES)`: SURUCU ve MUSTERI
 *     hicbir ucu goremez (403). Dispatch kuyrugu bir planlama yuzeyidir ve
 *     surucunun kendi gorevi disinda filo capinda bir goruntusu olmamali.
 *   - `@RequiresWrite()` yalnizca YAZMA uclarinda. Bu, MUHASEBEYI kuyrugun
 *     ICINDE ama plani DEGISTIREMEZ durumda tutar: `OPERATIONAL_ROLES`
 *     okumaya izin verir, `OPERATIONAL_WRITE_ROLES` (admin/boss/office)
 *     yazmaya. Muhasebenin planlama yapmasi `transport-orders`ta da yasak ve
 *     bu uc o kisiti GEVSETEMEZ.
 *   - Rol kontrolu IKI KATMANLI: guard'a ek olarak `DispatchApprovalService`
 *     kendi `APPROVAL_ROLES` kontrolunu yapiyor. Guard'in yanlislikla
 *     kaldirilmasi servisi acmasin diye.
 *
 * AJAN VE WORKER BURAYA GIREMEZ. Connector'in bir kullanici rolu yoktur;
 * `RolesGuard` onu zaten dusurur. Is durumu ve ajan ciktisi YALNIZCA
 * `ordivan/connector` altindaki scoped protokol uclarindan guncellenir —
 * bu controller'da ne `generation`, ne `jobStatus`, ne de `proposalId` yazan
 * bir uc VAR.
 *
 * FINANS MASKESI SUNUCUDA: butun okuma uclari `DispatchReadService`
 * uzerinden gecer ve rol bazli maskelenmis, ACIKCA TIPLENMIS bir govde doner.
 * Ham Prisma ya da ham `AutomationProposal` JSON'u bu controller'dan CIKMAZ.
 */
@Controller('dispatch')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly approval: DispatchApprovalService,
    private readonly read: DispatchReadService,
  ) {}

  // -------------------------------------------------------------------------
  // Uretim
  // -------------------------------------------------------------------------

  /**
   * Planlama talebi acar.
   *
   * `@RequiresWrite()`: plan acmak bir OPERASYON karari. Muhasebe kuyrugu
   * gorur ama plan URETEMEZ.
   *
   * Istemci ne aday, ne uygunluk sonucu, ne de guven skoru dayatabilir —
   * hicbiri `CreateDispatchProposalDto` icinde YOK ve global
   * `forbidNonWhitelisted` gonderilirse istegi dusurur.
   */
  @Post('proposals')
  @RequiresWrite()
  @HttpCode(201)
  create(@Req() request: AuthenticatedRequest, @Body() dto: CreateDispatchProposalDto) {
    return this.dispatch.createProposal(request.user.id, {
      transportOrderIds: dto.transportOrderIds,
      workDate: dto.workDate,
    });
  }

  /**
   * Basarisiz uretimi yeniden dener.
   *
   * Yeni bir oneri ACMAZ — ayni talebin denemesini artirir. Tekrar politikasi
   * serviste (`canRetryGeneration`); burada yalnizca yetki var.
   */
  @Post('proposals/:id/retry')
  @RequiresWrite()
  @HttpCode(202)
  retry(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.dispatch.retryGeneration(request.user.id, id);
  }

  // -------------------------------------------------------------------------
  // Kuyruk ve detay
  // -------------------------------------------------------------------------

  /** Kuyruk — SAYFALI. Sayfa boyutu ust sinirli (bkz. DTO). */
  @Get('proposals')
  list(@Req() request: AuthenticatedRequest, @Query() query: ListDispatchProposalsQueryDto) {
    return this.read.list(query, request.user.role);
  }

  @Get('proposals/:id')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.read.detail(id, request.user.role);
  }

  /** Uygun arac/surucu adaylari ve UC DURUMLU kontrolleri. */
  @Get('proposals/:id/candidates')
  candidates(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.read.candidates(id, request.user.role);
  }

  /**
   * Verilmis manual override BEYANLARI.
   *
   * Beyanin KENDISI onay govdesinde veriliyor (`ApproveDispatchDto.overrides`)
   * cunku beyan ile onay AYRILAMAZ: ayri bir uctan "beyan ettim" deyip sonra
   * onaylamak, beyani onay aninda dogrulanan bir kapsamdan kopuk bir bayrağa
   * cevirirdi. Bu uc yalnizca OKUR: kim, ne zaman, hangi kontrol icin ne dedi.
   */
  @Get('proposals/:id/overrides')
  overrides(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.read.overrides(id, request.user.role);
  }

  /** Onaydan cikan `Tour`. Uygulanmamis oneri 404 doner. */
  @Get('proposals/:id/tour')
  resultTour(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    return this.read.resultTour(id, request.user.role);
  }

  // -------------------------------------------------------------------------
  // Karar
  // -------------------------------------------------------------------------

  /**
   * Onay — `Assignment` + `Tour` ATOMIK olarak olusur.
   *
   * `@RequiresWrite()` + servisteki `APPROVAL_ROLES`: muhasebe plan
   * UYGULAYAMAZ. `expectedUpdatedAt`, `proposalRevision` ve `idempotencyKey`
   * DTO'da zorunlu; eksigi 400 ile duser.
   */
  @Post('proposals/:id/approve')
  @RequiresWrite()
  @HttpCode(200)
  approve(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ApproveDispatchDto,
  ) {
    return this.approval.approve(request.user.id, request.user.role, id, {
      vehicleId: dto.vehicleId,
      driverId: dto.driverId,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      proposalRevision: dto.proposalRevision,
      idempotencyKey: dto.idempotencyKey,
      overrides: dto.overrides,
    });
  }

  /** Red — HICBIR domain kaydi olusmaz. */
  @Post('proposals/:id/reject')
  @RequiresWrite()
  @HttpCode(200)
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RejectDispatchDto,
  ) {
    return this.approval.reject(request.user.id, request.user.role, id, {
      reason: dto.reason,
      expectedUpdatedAt: dto.expectedUpdatedAt,
      proposalRevision: dto.proposalRevision,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
