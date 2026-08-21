import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
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
import { DeliverySlotService } from './delivery-slot.service';
import { DeliverySlotSessionService } from './delivery-slot-session.service';
import {
  CreateSlotDto,
  CreateSlotInvitationDto,
  ListManagedSlotsQueryDto,
  ListSlotInvitationsQueryDto,
  ReissueSlotInvitationDto,
  UpdateSlotDto,
} from './dto/delivery-slot.dto';

interface AuthenticatedRequest {
  user: { id: string; role?: string };
}

/**
 * TESLIMAT SLOTLARI — IC YONETIM (Faz 17f).
 *
 * ROLLER: `dispatch.controller` ile AYNI kombinasyon — surucu ve musteri
 * disarida, muhasebe okur ama YAZAMAZ. Slot plani bir OPERASYON kararidir;
 * muhasebenin depo rampasini kapatabilmesi icin hicbir sebep yok.
 *
 * IKI KATMAN: guard'lara ek olarak `DeliverySlotService.assertManageRole`
 * kendi kontrolunu yapiyor (`admin`/`boss`/`office`). Guard'in yanlislikla
 * kaldirilmasi servisi acmasin diye.
 *
 * DUZ METIN TOKEN YALNIZCA OLUSTURMA VE YENILEME yanitinda, BIR KEZ doner.
 * Liste ucu yalnizca kirilmis oneki tasir; token ozeti HICBIR uctan cikmaz.
 */
@Controller('delivery-slots')
@UseGuards(JwtAuthGuard, DriverBlockGuard, RolesGuard)
@Roles(...OPERATIONAL_ROLES)
export class DeliverySlotController {
  constructor(
    private readonly slots: DeliverySlotService,
    private readonly sessions: DeliverySlotSessionService,
  ) {}

  // -------------------------------------------------------------------------
  // Davetler
  // -------------------------------------------------------------------------

  /**
   * Davet olusturur. YANITTAKI `token` BIR DAHA ELDE EDILEMEZ.
   *
   * Ayni kalem+uc icin ikinci bir aktif davet VERITABANINDA engelli
   * (`activeTargetKey @unique`); ikinci istek 409 alir.
   */
  @Post('invitations')
  @RequiresWrite()
  @HttpCode(201)
  createInvitation(@Req() request: AuthenticatedRequest, @Body() dto: CreateSlotInvitationDto) {
    return this.slots.createInvitation(request.user.id, request.user.role, {
      consignmentId: dto.consignmentId,
      kind: dto.kind,
      expiresInHours: dto.expiresInHours,
    });
  }

  /** Davet listesi — SAYFALI. Token ozeti ve duz metni YOK. */
  @Get('invitations')
  listInvitations(@Req() request: AuthenticatedRequest, @Query() query: ListSlotInvitationsQueryDto) {
    return this.slots.listInvitations(request.user.role, query);
  }

  /** Iptal — link ANINDA gecersiz. Kayit SILINMEZ, denetimde kalir. */
  @Post('invitations/:id/revoke')
  @RequiresWrite()
  @HttpCode(200)
  async revokeInvitation(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    const result = await this.slots.revokeInvitation(request.user.id, request.user.role, id);
    /**
     * ACIK OTURUMLAR DA KAPANIYOR.
     *
     * Oturum her istekte daveti yeniden okudugu icin iptal ZATEN aninda
     * etkili; bu cagri o korumanin YERINE GECMIYOR, USTUNE BINIYOR. Iptal
     * edilmis bir davetin oturum satirinin "acik" gorunmeye devam etmesi,
     * denetime bakan birine yanlis bir tablo gosterirdi.
     */
    await this.sessions.revokeForInvitation(id);
    return result;
  }

  /** Yeni davet: eskisi once iptal edilir, sonra yenisi uretilir. */
  @Post('invitations/:id/reissue')
  @RequiresWrite()
  @HttpCode(201)
  async reissueInvitation(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ReissueSlotInvitationDto,
  ) {
    // Eski link gecersiz kilindi: onunla acilmis oturumlar da kapanmali.
    await this.sessions.revokeForInvitation(id);
    return this.slots.reissueInvitation(request.user.id, request.user.role, id, dto.expiresInHours);
  }

  // -------------------------------------------------------------------------
  // Slot ve kapasite
  // -------------------------------------------------------------------------

  @Get()
  listSlots(@Req() request: AuthenticatedRequest, @Query() query: ListManagedSlotsQueryDto) {
    return this.slots.listManagedSlots(request.user.role, query);
  }

  /** Slot acar. `timezone` SUNUCUDA cozuluyor — istemci secemez. */
  @Post()
  @RequiresWrite()
  @HttpCode(201)
  createSlot(@Req() request: AuthenticatedRequest, @Body() dto: CreateSlotDto) {
    return this.slots.createSlot(request.user.id, request.user.role, {
      locationId: dto.locationId,
      startsAt: dto.startsAt,
      endsAt: dto.endsAt,
      capacity: dto.capacity,
      resourceRef: dto.resourceRef,
    });
  }

  /** Kapasite/durum. Kapasite mevcut rezervasyonun ALTINA indirilemez. */
  @Patch(':id')
  @RequiresWrite()
  @HttpCode(200)
  updateSlot(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSlotDto,
  ) {
    return this.slots.updateSlot(request.user.id, request.user.role, id, {
      capacity: dto.capacity,
      status: dto.status,
    });
  }
}
