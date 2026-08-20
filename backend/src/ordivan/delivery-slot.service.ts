import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  SAFE_INVITATION_ERROR,
  activeTargetKey,
  capacityClaimWhere,
  evaluateInvitation,
  evaluateSlot,
  hashSlotToken,
  issueSlotToken,
  registerFailedAttempt,
  resolveSlotTimeZone,
  type InvitationRejection,
} from './core/delivery-slot-security';

/**
 * TESLIMAT SLOT REZERVASYONU (Faz 17e).
 *
 * PARALEL SIPARIS/TAKVIM SISTEMI YOK. Rezervasyon `TransportOrder`i ya da
 * degismez revizyonunu DEGISTIRMEZ; ayri bir canonical kayit olarak durur ve
 * dispatch hesabinda ETKIN zaman penceresi olarak kullanilir. Siparisi
 * degistirseydik, musterinin sozlesmeye bagladigi pencere sessizce baska bir
 * seye donusurdu.
 *
 * PUBLIC UC GIRIS GEREKTIRMEZ ve tam da bu yuzden dar: token TEK HEDEFE bagli,
 * yanit fiyat/arac/surucu/baska siparis ICERMEZ ve butun basarisiz sonuclar
 * AYNI cevabi verir.
 */

/** Davet yonetimi yalnizca operasyon YAZMA rollerinde. */
const SLOT_MANAGE_ROLES: readonly string[] = ['admin', 'boss', 'office'];

export interface CreateInvitationInput {
  consignmentId: string;
  kind: 'pickup' | 'delivery';
  /** Gecerlilik suresi (saat). */
  expiresInHours?: number;
}

export interface PublicSlotView {
  id: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  resourceRef: string | null;
  available: boolean;
}

@Injectable()
export class DeliverySlotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Davet yonetimi (ic kullanici)
  // -------------------------------------------------------------------------

  /**
   * Slot daveti olusturur. DUZ METIN TOKEN YALNIZCA BURADA, BIR KEZ doner.
   *
   * AYNI HEDEFTE TEK AKTIF DAVET: `activeTargetKey` tekil oldugu icin ayni
   * kalem+uc icin ikinci bir gecerli link uretilemez. Kural uygulamada degil
   * VERITABANINDA — iki istek ayni anda gelirse uygulama kontrolu yarisi
   * kaybeder.
   */
  async createInvitation(
    userId: string,
    role: string | null | undefined,
    input: CreateInvitationInput,
  ): Promise<{ invitationId: string; token: string; expiresAt: string }> {
    this.assertManageRole(role);

    const consignment = await this.prisma.consignment.findFirst({
      where: { id: input.consignmentId },
      select: {
        id: true,
        transportOrder: { select: { id: true, status: true, currentRevision: true } },
      },
    });
    if (!consignment) {
      // Kiraci kapsamli sorgu: baska kiracinin kalemi "yok" gorunur.
      throw new NotFoundException({ code: 'slot_consignment_not_found' });
    }
    if (consignment.transportOrder.status !== 'confirmed') {
      throw new BadRequestException({ code: 'slot_order_not_confirmed' });
    }

    const issued = issueSlotToken();
    const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 72) * 60 * 60 * 1000);

    try {
      const invitation = await this.prisma.deliverySlotInvitation.create({
        data: {
          consignmentId: consignment.id,
          kind: input.kind,
          tokenHash: issued.tokenHash,
          tokenPrefix: issued.tokenPrefix,
          // DAVET REVIZYONA BAGLI: siparis degisirse link gecersiz olur.
          sourceRevision: consignment.transportOrder.currentRevision,
          activeTargetKey: activeTargetKey(consignment.id, input.kind),
          expiresAt,
          createdById: userId,
        },
        select: { id: true },
      });

      await this.audit.logAction({
        actorUserId: userId,
        action: 'delivery_slot.invitation_created',
        entityType: 'DeliverySlotInvitation',
        entityId: invitation.id,
        summary: 'Zeitfenster-Einladung erstellt',
        // TOKEN VE OZETI DENETIME GIRMEZ. Denetim kaydi genis okunur; oraya
        // yazilan bir ozet, linki kullanilabilir kilmasa da gereksiz bir
        // sizinti yuzeyidir. Kisisel veri de yok.
        metadata: {
          consignmentId: consignment.id,
          kind: input.kind,
          sourceRevision: consignment.transportOrder.currentRevision,
          expiresAt: expiresAt.toISOString(),
        },
      });

      return { invitationId: invitation.id, token: issued.token, expiresAt: expiresAt.toISOString() };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Ayni hedefte zaten aktif bir davet var.
        throw new ConflictException({ code: 'slot_invitation_already_active' });
      }
      throw error;
    }
  }

  /**
   * Daveti iptal eder — link ANINDA gecersiz olur.
   *
   * `activeTargetKey` birakiliyor ki yeni bir davet uretilebilsin. Kayit
   * SILINMIYOR: hangi link ne zaman verilmis ve iptal edilmis, denetimde
   * kalmali.
   */
  async revokeInvitation(
    userId: string,
    role: string | null | undefined,
    invitationId: string,
  ): Promise<{ invitationId: string }> {
    this.assertManageRole(role);

    const claimed = await this.prisma.deliverySlotInvitation.updateMany({
      where: { id: invitationId, status: 'open' },
      data: { status: 'revoked', activeTargetKey: null },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ code: 'slot_invitation_not_open' });
    }

    await this.audit.logAction({
      actorUserId: userId,
      action: 'delivery_slot.invitation_revoked',
      entityType: 'DeliverySlotInvitation',
      entityId: invitationId,
      summary: 'Zeitfenster-Einladung widerrufen',
      metadata: { invitationId },
    });

    return { invitationId };
  }

  // -------------------------------------------------------------------------
  // Public uc (token ile, girissiz)
  // -------------------------------------------------------------------------

  /**
   * Token'i cozer ve daveti doner.
   *
   * BUTUN BASARISIZ SONUCLAR AYNI CEVABI VERIR: gecersiz, suresi dolmus,
   * iptal edilmis ve BASKA KIRACIYA ait token ayirt EDILEMEZ. Ayirt
   * edilebilselerdi saldirgan kalemin VARLIGINI ogrenirdi.
   *
   * KIRACI ISTEMCIDEN ALINMAZ: token'in kendisi kiraciyi belirler. Bu sorgu
   * bilincli olarak `unscoped` — kiraci HENUZ bilinmiyor; bulunan kayit
   * kiraciyi TASIYOR ve sonraki her adim ona gore yapiliyor.
   */
  private async resolveInvitation(token: string) {
    if (!token || token.length < 20) {
      throw new NotFoundException(SAFE_INVITATION_ERROR);
    }

    const invitation = await this.prisma.unscoped.deliverySlotInvitation.findUnique({
      where: { tokenHash: hashSlotToken(token) },
      select: {
        id: true,
        tenantId: true,
        consignmentId: true,
        kind: true,
        status: true,
        expiresAt: true,
        sourceRevision: true,
        attemptCount: true,
        lockedUntil: true,
        consignment: {
          select: {
            id: true,
            pickupLocationId: true,
            deliveryLocationId: true,
            transportOrder: { select: { currentRevision: true, status: true } },
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException(SAFE_INVITATION_ERROR);
    }

    const now = new Date();
    const verdict = evaluateInvitation(
      {
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        sourceRevision: invitation.sourceRevision,
        attemptCount: invitation.attemptCount,
        lockedUntil: invitation.lockedUntil,
      },
      now,
      invitation.consignment.transportOrder.currentRevision,
    );

    if (!verdict.usable) {
      await this.registerFailure(invitation.id, invitation.attemptCount, invitation.lockedUntil, now, verdict.reason!);
      throw new NotFoundException(SAFE_INVITATION_ERROR);
    }

    return invitation;
  }

  /**
   * Basarisiz denemeyi kaydeder ve gerekiyorsa kilitler.
   *
   * SEBEP YALNIZCA DENETIME yaziliyor; istemci hep ayni cevabi aliyor.
   */
  private async registerFailure(
    invitationId: string,
    attemptCount: number,
    lockedUntil: Date | null,
    now: Date,
    reason: InvitationRejection,
  ): Promise<void> {
    const next = registerFailedAttempt({ attemptCount, lockedUntil }, now);
    await this.prisma.unscoped.deliverySlotInvitation.updateMany({
      where: { id: invitationId },
      data: { attemptCount: next.attemptCount, lockedUntil: next.lockedUntil, lastAttemptAt: now },
    });
    await this.audit.logAction({
      action: 'delivery_slot.invitation_rejected',
      entityType: 'DeliverySlotInvitation',
      entityId: invitationId,
      summary: 'Zeitfenster-Link abgelehnt',
      // TOKEN/OZET YOK; yalnizca sayilabilir sebep.
      metadata: { reason, attemptCount: next.attemptCount },
    });
  }

  /**
   * Davetin gorebilecegi slotlari listeler.
   *
   * YANIT DAR: yalnizca zaman, dilim ve kaynak. Fiyat, arac, surucu, musteri
   * adi ya da baska siparis BILGISI YOK — link sizarsa ogrenilebilecek sey
   * "su depoda su saatlerde yer var"dan ibaret.
   */
  async listSlots(token: string): Promise<{ kind: string; slots: PublicSlotView[] }> {
    const invitation = await this.resolveInvitation(token);
    const locationId =
      invitation.kind === 'pickup'
        ? invitation.consignment.pickupLocationId
        : invitation.consignment.deliveryLocationId;

    if (!locationId) {
      throw new NotFoundException(SAFE_INVITATION_ERROR);
    }

    const now = new Date();
    const slots = await this.prisma.unscoped.deliverySlot.findMany({
      where: {
        // KIRACI TOKEN'DAN: istemci kiraci belirtemez.
        tenantId: invitation.tenantId,
        locationId,
        startsAt: { gt: now },
      },
      orderBy: { startsAt: 'asc' },
      take: 200,
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        resourceRef: true,
        capacity: true,
        bookedCount: true,
        status: true,
      },
    });

    return {
      kind: invitation.kind,
      slots: slots.map((slot) => ({
        id: slot.id,
        startsAt: slot.startsAt.toISOString(),
        endsAt: slot.endsAt.toISOString(),
        timezone: slot.timezone,
        resourceRef: slot.resourceRef || null,
        available: evaluateSlot(slot, now).selectable,
      })),
    };
  }

  /**
   * Slot secer.
   *
   * KAPASITE KOSULLU UPDATE ILE: `bookedCount < capacity` sarti veritabaninda
   * degerlendiriliyor. Once okuyup sonra yazsaydik son kontenjani iki
   * eszamanli istek de musait gorur ve ikisi de rezerve ederdi.
   *
   * IDEMPOTENT: ayni davet ayni slotu tekrar secerse MEVCUT rezervasyon
   * doner; ikinci kez kontenjan tuketilmez.
   */
  async book(token: string, slotId: string): Promise<{ bookingId: string; repeated: boolean }> {
    const invitation = await this.resolveInvitation(token);
    const now = new Date();

    const slot = await this.prisma.unscoped.deliverySlot.findFirst({
      where: { id: slotId, tenantId: invitation.tenantId },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        bookedCount: true,
        status: true,
        locationId: true,
      },
    });
    if (!slot) {
      // Baska kiracinin slotu da BURADA "yok" gorunur.
      throw new NotFoundException(SAFE_INVITATION_ERROR);
    }

    // TOKEN BASKA HEDEFTE KULLANILAMAZ: slot, davetin ucuna ait konumda olmali.
    const allowedLocationId =
      invitation.kind === 'pickup'
        ? invitation.consignment.pickupLocationId
        : invitation.consignment.deliveryLocationId;
    if (!allowedLocationId || slot.locationId !== allowedLocationId) {
      throw new NotFoundException(SAFE_INVITATION_ERROR);
    }

    const verdict = evaluateSlot(slot, now);
    if (!verdict.selectable) {
      throw new ConflictException({ code: 'slot_not_selectable', reason: verdict.reason });
    }

    // IDEMPOTENT TEKRAR: ayni davet + ayni slot zaten aktifse yeni kayit yok.
    const existing = await this.prisma.unscoped.deliverySlotBooking.findFirst({
      where: { activeInvitationId: invitation.id },
      select: { id: true, slotId: true },
    });
    if (existing) {
      if (existing.slotId === slotId) {
        return { bookingId: existing.id, repeated: true };
      }
      // FARKLI SLOT: bu bir DEGISIKLIK. Once eskisi birakilir (append-only
      // gecmis korunur), sonra yenisi alinir.
      await this.releaseBooking(existing.id, existing.slotId, 'changed');
    }

    const booking = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.deliverySlot.updateMany({
        where: capacityClaimWhere(slot.id, slot.capacity),
        data: { bookedCount: { increment: 1 } },
      });
      if (claimed.count === 0) {
        // YARISI KAYBETTIK: son kontenjani baskasi aldi.
        throw new ConflictException({ code: 'slot_capacity_exhausted' });
      }

      const created = await tx.deliverySlotBooking.create({
        data: {
          tenantId: invitation.tenantId,
          invitationId: invitation.id,
          slotId: slot.id,
          activeInvitationId: invitation.id,
        },
        select: { id: true },
      });

      await tx.deliverySlotInvitation.updateMany({
        where: { id: invitation.id, status: 'open' },
        data: { status: 'booked', activeTargetKey: null, attemptCount: 0, lockedUntil: null },
      });

      return created;
    });

    await this.audit.logAction({
      action: 'delivery_slot.booked',
      entityType: 'DeliverySlotBooking',
      entityId: booking.id,
      summary: 'Zeitfenster gebucht',
      // TOKEN/OZET YOK.
      metadata: { slotId: slot.id, kind: invitation.kind, consignmentId: invitation.consignmentId },
    });

    // SLOT DEGISTI: acik dispatch onerileri artik ESKI pencereye dayaniyor.
    await this.invalidateOpenProposals(invitation.consignmentId, invitation.tenantId);

    return { bookingId: booking.id, repeated: false };
  }

  /**
   * Rezervasyonu birakir — APPEND-ONLY.
   *
   * Satir SILINMEZ, `cancelledAt` damgalanir ve `activeInvitationId` birakilir.
   * "Musteri once hangi saati secmisti" sorusunun cevabi bu tabloda kalir.
   */
  private async releaseBooking(bookingId: string, slotId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const released = await tx.deliverySlotBooking.updateMany({
        where: { id: bookingId, cancelledAt: null },
        data: { cancelledAt: new Date(), cancelReason: reason, activeInvitationId: null },
      });
      if (released.count === 0) return;
      // Kontenjan geri veriliyor — yalnizca gercekten birakilmissa.
      await tx.deliverySlot.updateMany({
        where: { id: slotId, bookedCount: { gt: 0 } },
        data: { bookedCount: { decrement: 1 } },
      });
    });
  }

  // -------------------------------------------------------------------------
  // Dispatch baglantisi
  // -------------------------------------------------------------------------

  /**
   * Slot degisince ACIK dispatch onerilerini gecersiz kilar.
   *
   * ONAYLANMIS/AKTIF TUR SESSIZCE DEGISMEZ: burada yalnizca `ready` + `open`
   * oneriler `superseded` isaretleniyor. Uygulanmis bir plani degistirmek
   * operasyonun haberi olmadan aracin gunun degistirmek olurdu; o durum bir
   * OPERASYON INCELEMESI gerektirir ve `resultTourId` dolu oneriler bu
   * sorgunun DISINDA.
   */
  private async invalidateOpenProposals(consignmentId: string, tenantId: string): Promise<void> {
    const consignment = await this.prisma.unscoped.consignment.findFirst({
      where: { id: consignmentId },
      select: { transportOrderId: true },
    });
    if (!consignment) return;

    await this.prisma.unscoped.dispatchProposal.updateMany({
      where: {
        tenantId,
        generation: 'ready',
        status: 'open',
        // UYGULANMIS PLAN DOKUNULMAZ.
        resultTourId: null,
        orders: { some: { transportOrderId: consignment.transportOrderId } },
      },
      data: { status: 'superseded', activeFingerprint: null },
    });
  }

  private assertManageRole(role: string | null | undefined): void {
    if (!SLOT_MANAGE_ROLES.includes(role ?? '')) {
      // Muhasebe ve surucu davet yonetemez.
      throw new ForbiddenException({ code: 'slot_manage_role_forbidden' });
    }
  }

  /** Konum dilimi yoksa kiracinin dilimi — sabit varsayilan YOK. */
  static timeZoneFor(locationTimeZone: string | null, tenantTimeZone: string): string {
    return resolveSlotTimeZone(locationTimeZone, tenantTimeZone);
  }
}
