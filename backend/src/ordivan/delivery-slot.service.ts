import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  DeliverySlotInvitationStatus,
  DeliverySlotKind,
  DeliverySlotStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContext } from '../tenant/tenant-context';
import { isSupportedTimeZone } from '../common/utils/timezone';
import { auditSafeSlotMetadata } from './core/dispatch-field-security';
import {
  SAFE_INVITATION_ERROR,
  SLOT_CHANGE_CUTOFF_MS,
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

export interface InvitationListRow {
  id: string;
  consignmentId: string;
  kind: DeliverySlotKind;
  status: DeliverySlotInvitationStatus;
  /** Kirilmis onek — TAM TOKEN DEGIL, ozet HIC DEGIL. */
  tokenPrefix: string;
  sourceRevision: number;
  expiresAt: string;
  locked: boolean;
  failedAttempts: number;
  createdAt: string;
  activeBooking: { bookingId: string; slotId: string; bookedAt: string } | null;
}

export interface ManagedSlotRow {
  id: string;
  locationId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  resourceRef: string;
  status: DeliverySlotStatus;
  capacity: number;
  bookedCount: number;
  remaining: number;
}

function toManagedSlotRow(row: {
  id: string;
  locationId: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  resourceRef: string;
  status: DeliverySlotStatus;
  capacity: number;
  bookedCount: number;
}): ManagedSlotRow {
  return {
    id: row.id,
    locationId: row.locationId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timezone: row.timezone,
    resourceRef: row.resourceRef,
    status: row.status,
    capacity: row.capacity,
    bookedCount: row.bookedCount,
    remaining: Math.max(0, row.capacity - row.bookedCount),
  };
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
        metadata: auditSafeSlotMetadata({
          consignmentId: consignment.id,
          kind: input.kind,
          sourceRevision: consignment.transportOrder.currentRevision,
          expiresAt: expiresAt.toISOString(),
        }),
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
      metadata: auditSafeSlotMetadata({ invitationId }),
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
  private async resolveInvitation(token: string, options: { allowBooked?: boolean } = {}) {
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

    /**
     * IPTAL EDERKEN `booked` KABUL EDILIR.
     *
     * Rezervasyon yapildiginda davet `booked` olur; iptal tam da o durumdan
     * cikmaktir. Diger butun sebepler (suresi dolmus, iptal edilmis, kilitli,
     * bayat revizyon) iptalde de REDDEDILIR ve AYNI cevabi verir — yoksa
     * saldirgan "iptal denemesi" ile bir token'in gercekten var olup
     * olmadigini ayirt ederdi.
     */
    const usable = verdict.usable || (options.allowBooked === true && verdict.reason === 'already_booked');
    if (!usable) {
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
      metadata: auditSafeSlotMetadata({ reason, attemptCount: next.attemptCount }),
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
   *
   * DEGISIKLIK DE BU UCTAN (Faz 17f): farkli bir `slotId` gonderildiginde
   * onceki rezervasyon birakilir ve yenisi alinir.
   *
   * `allowBooked` NEDEN GEREKLI: ilk rezervasyondan sonra davetin durumu
   * `booked` olur. Bunu kabul etmeseydik — 17e'de oldugu gibi — ikinci istek
   * `resolveInvitation` kapisinda duser ve asagidaki tekrar/degisiklik
   * dallari HIC CALISMAZDI. Sonuc: musteri saatini degistiremez, tekrarlanan
   * bir istek de "link gecersiz" cevabi alirdi. Servis testleri Prisma'yi
   * taklit ettigi icin bu, ancak gercek bir istekte gorulebiliyordu.
   */
  async book(token: string, slotId: string): Promise<{ bookingId: string; repeated: boolean }> {
    const invitation = await this.resolveInvitation(token, { allowBooked: true });
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
      /**
       * FARKLI SLOT: bu bir DEGISIKLIK.
       *
       * ESKI SLOTUN KESIM SURESI DE GECERLI: depo o noktada rampayi ayirmis
       * olur ve "artik gelmiyorum" haberi kimseye ulasmaz. Yalnizca YENI
       * slotu kontrol etseydik, musteri iki saat sonra baslayan bir
       * randevudan bir hafta sonrakine kacabilir ve bosalan rampa kimseye
       * bildirilmeden bos kalirdi.
       */
      const current = await this.prisma.unscoped.deliverySlot.findFirst({
        where: { id: existing.slotId, tenantId: invitation.tenantId },
        select: { startsAt: true },
      });
      if (current && current.startsAt.getTime() - now.getTime() < SLOT_CHANGE_CUTOFF_MS) {
        throw new ConflictException({ code: 'slot_change_cutoff' });
      }
      // Once eskisi birakilir (append-only gecmis korunur), sonra yenisi alinir.
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

      /**
       * DURUM KOSULU YOK: degisiklik yolunda davet ZATEN `booked` ve
       * `status: 'open'` sarti sifir satir etkilerdi — davet `booked`
       * kalirdi ama sayaclar sifirlanmazdi. Bu noktaya ancak kapasiteyi
       * kazanmis bir istek ulasir, dolayisiyla kosulsuz yazmak guvenli.
       */
      await tx.deliverySlotInvitation.updateMany({
        where: { id: invitation.id },
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
      metadata: auditSafeSlotMetadata({ slotId: slot.id, kind: invitation.kind, consignmentId: invitation.consignmentId }),
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

  /**
   * Davetleri listeler — IC KULLANICI.
   *
   * TOKEN VE OZETI YANITA GIRMEZ. `tokenPrefix` destek ekibi "hangi link"
   * diye sorabilsin diye var ve tahmin icin anlamsiz; ozeti ya da duz metni
   * dondurmek, ozetleyerek saklamanin butun anlamini yok ederdi.
   */
  async listInvitations(
    role: string | null | undefined,
    query: { consignmentId?: string; status?: DeliverySlotInvitationStatus; page?: number; pageSize?: number },
  ): Promise<{
    rows: InvitationListRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    this.assertManageRole(role);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);

    const where: Prisma.DeliverySlotInvitationWhereInput = {};
    if (query.consignmentId) where.consignmentId = query.consignmentId;
    if (query.status) where.status = query.status;

    const [total, rows] = await Promise.all([
      this.prisma.deliverySlotInvitation.count({ where }),
      this.prisma.deliverySlotInvitation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          consignmentId: true,
          kind: true,
          status: true,
          tokenPrefix: true,
          sourceRevision: true,
          expiresAt: true,
          lockedUntil: true,
          attemptCount: true,
          createdAt: true,
          bookings: {
            where: { cancelledAt: null },
            select: { id: true, slotId: true, bookedAt: true },
          },
        },
      }),
    ]);

    const now = new Date();
    return {
      rows: rows.map((row) => ({
        id: row.id,
        consignmentId: row.consignmentId,
        kind: row.kind,
        status: row.status,
        tokenPrefix: row.tokenPrefix,
        sourceRevision: row.sourceRevision,
        expiresAt: row.expiresAt.toISOString(),
        // KILIT DURUMU EVET/HAYIR: kilidin ne zaman bittigini vermek, kaba
        // kuvvet deneyen birine "ne zaman tekrar deneyeyim" demek olurdu.
        // Ic kullanici icin bu bilgi yeterli.
        locked: row.lockedUntil !== null && row.lockedUntil.getTime() > now.getTime(),
        failedAttempts: row.attemptCount,
        createdAt: row.createdAt.toISOString(),
        activeBooking: row.bookings[0]
          ? { bookingId: row.bookings[0].id, slotId: row.bookings[0].slotId, bookedAt: row.bookings[0].bookedAt.toISOString() }
          : null,
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Yeni davet uretir — ESKISI ONCE IPTAL EDILIR.
   *
   * `activeTargetKey` TEKIL oldugu icin acik bir davet dururken ikincisi
   * olusturulamaz. Iptal ve olusturma AYNI ISLEMDE degil ve bu bilincli:
   * `createInvitation` kendi kontrollerini (siparis `confirmed` mi, kalem bu
   * kiracida mi) yeniden yapiyor ve ikisini tek islemde birlestirmek o
   * kontrolleri atlamanin yolu olurdu. Iptal edilip yenisi olusmazsa sonuc
   * "davet yok"tur — guvenli taraf.
   */
  async reissueInvitation(
    userId: string,
    role: string | null | undefined,
    invitationId: string,
    expiresInHours?: number,
  ): Promise<{ invitationId: string; token: string; expiresAt: string }> {
    this.assertManageRole(role);

    const existing = await this.prisma.deliverySlotInvitation.findFirst({
      where: { id: invitationId },
      select: { id: true, consignmentId: true, kind: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException({ code: 'slot_invitation_not_found' });
    }

    if (existing.status === 'open') {
      await this.revokeInvitation(userId, role, existing.id);
    }

    return this.createInvitation(userId, role, {
      consignmentId: existing.consignmentId,
      kind: existing.kind,
      expiresInHours,
    });
  }

  /** Slot ve kapasite listesi — IC KULLANICI. */
  async listManagedSlots(
    role: string | null | undefined,
    query: { locationId?: string; from?: string; to?: string; page?: number; pageSize?: number },
  ): Promise<{
    rows: ManagedSlotRow[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }> {
    this.assertManageRole(role);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(query.pageSize ?? 25, 1), 100);

    const where: Prisma.DeliverySlotWhereInput = {};
    if (query.locationId) where.locationId = query.locationId;
    if (query.from || query.to) {
      where.startsAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lt: new Date(query.to) } : {}),
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.deliverySlot.count({ where }),
      this.prisma.deliverySlot.findMany({
        where,
        orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          locationId: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          resourceRef: true,
          status: true,
          capacity: true,
          bookedCount: true,
        },
      }),
    ]);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        locationId: row.locationId,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        timezone: row.timezone,
        resourceRef: row.resourceRef,
        status: row.status,
        capacity: row.capacity,
        bookedCount: row.bookedCount,
        remaining: Math.max(0, row.capacity - row.bookedCount),
      })),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * Slot acar.
   *
   * DILIM SUNUCUDA COZULUYOR: istemci `timezone` gonderemez. Konumun dilimi,
   * o yoksa KIRACININ dilimi kullaniliyor — sabit `Europe/Berlin` YOK.
   * Istemciye biraksaydik, yanlis bir dilim penceresi saatlerce kaydirirdi.
   */
  async createSlot(
    userId: string,
    role: string | null | undefined,
    input: { locationId: string; startsAt: string; endsAt: string; capacity: number; resourceRef?: string },
  ): Promise<ManagedSlotRow> {
    this.assertManageRole(role);

    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new BadRequestException({ code: 'slot_window_invalid' });
    }
    if (endsAt.getTime() <= startsAt.getTime()) {
      // SIFIR VE NEGATIF PENCERE: kapasiteyi tuketebilen ama hicbir zaman
      // gelmeyen bir slot uretirdi.
      throw new BadRequestException({ code: 'slot_window_invalid' });
    }

    const location = await this.prisma.location.findFirst({
      where: { id: input.locationId },
      select: { id: true, timezone: true },
    });
    if (!location) {
      // Baska kiracinin konumu da BURADA "yok" gorunur.
      throw new NotFoundException({ code: 'slot_location_not_found' });
    }

    const tenantTimeZone = await this.resolveTenantTimeZone();
    const timezone = DeliverySlotService.timeZoneFor(location.timezone, tenantTimeZone);
    if (!isSupportedTimeZone(timezone)) {
      throw new BadRequestException({ code: 'slot_timezone_invalid' });
    }

    try {
      const created = await this.prisma.deliverySlot.create({
        data: {
          locationId: location.id,
          startsAt,
          endsAt,
          timezone,
          resourceRef: input.resourceRef?.trim() ?? '',
          capacity: input.capacity,
        },
        select: {
          id: true,
          locationId: true,
          startsAt: true,
          endsAt: true,
          timezone: true,
          resourceRef: true,
          status: true,
          capacity: true,
          bookedCount: true,
        },
      });

      await this.audit.logAction({
        actorUserId: userId,
        action: 'delivery_slot.slot_created',
        entityType: 'DeliverySlot',
        entityId: created.id,
        summary: 'Zeitfenster angelegt',
        metadata: auditSafeSlotMetadata({
          locationId: created.locationId,
          startsAt: created.startsAt.toISOString(),
          endsAt: created.endsAt.toISOString(),
          capacity: created.capacity,
        }),
      });

      return { ...toManagedSlotRow(created) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Ayni yer + kaynak + UTC araligi ikinci kez tanimlanamaz.
        throw new ConflictException({ code: 'slot_already_defined' });
      }
      throw error;
    }
  }

  /**
   * Kapasiteyi ya da durumu degistirir.
   *
   * KAPASITE REZERVASYONUN ALTINA INDIRILEMEZ. Indirilebilseydi zaten
   * verilmis randevular sessizce "fazla rezerve" olur ve depo o saatte
   * karsilayamayacagi araclari bekler hale gelirdi. Kucultmek isteyen once
   * randevulari tasimali — bu bir OPERASYON karari, bir alan guncellemesi degil.
   */
  async updateSlot(
    userId: string,
    role: string | null | undefined,
    slotId: string,
    input: { capacity?: number; status?: DeliverySlotStatus },
  ): Promise<ManagedSlotRow> {
    this.assertManageRole(role);

    const slot = await this.prisma.deliverySlot.findFirst({
      where: { id: slotId },
      select: { id: true, capacity: true, bookedCount: true },
    });
    if (!slot) {
      throw new NotFoundException({ code: 'slot_not_found' });
    }
    if (input.capacity !== undefined && input.capacity < slot.bookedCount) {
      throw new ConflictException({ code: 'slot_capacity_below_bookings' });
    }

    const updated = await this.prisma.deliverySlot.update({
      where: { id: slot.id },
      data: {
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
      select: {
        id: true,
        locationId: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        resourceRef: true,
        status: true,
        capacity: true,
        bookedCount: true,
      },
    });

    await this.audit.logAction({
      actorUserId: userId,
      action: 'delivery_slot.slot_updated',
      entityType: 'DeliverySlot',
      entityId: updated.id,
      summary: 'Zeitfenster geaendert',
      metadata: auditSafeSlotMetadata({
        slotId: updated.id,
        capacity: updated.capacity,
        status: updated.status,
      }),
    });

    return toManagedSlotRow(updated);
  }

  /**
   * Rezervasyonu iptal eder — PUBLIC, token ile.
   *
   * KESIM SURESI BURADA DA GECERLI: slot baslangicina az kalmissa depo rampayi
   * ayirmis olur ve son dakika iptali kimseye ulasmaz. Bu, token gecerliligiyle
   * ILGISIZ bir durumdur ve ayri bir hata koduyla donuyor — token'in var olup
   * olmadigini ele vermez, cunku bu noktaya ancak GECERLI bir token ulasir.
   */
  async cancelBooking(token: string): Promise<{ cancelled: boolean }> {
    const invitation = await this.resolveInvitation(token, { allowBooked: true });

    const booking = await this.prisma.unscoped.deliverySlotBooking.findFirst({
      where: { activeInvitationId: invitation.id },
      select: { id: true, slotId: true },
    });
    if (!booking) {
      // Aktif rezervasyon yok: IDEMPOTENT. Ikinci iptal hata degil.
      return { cancelled: false };
    }

    const slot = await this.prisma.unscoped.deliverySlot.findFirst({
      where: { id: booking.slotId, tenantId: invitation.tenantId },
      select: { startsAt: true, endsAt: true, capacity: true, bookedCount: true, status: true },
    });
    if (slot) {
      const now = new Date();
      if (slot.startsAt.getTime() - now.getTime() < SLOT_CHANGE_CUTOFF_MS) {
        throw new ConflictException({ code: 'slot_change_cutoff' });
      }
    }

    await this.releaseBooking(booking.id, booking.slotId, 'cancelled_by_customer');

    // Davet YENIDEN ACILIYOR: musteri iptal ettiyse baska bir saat secebilmeli.
    await this.prisma.unscoped.deliverySlotInvitation.updateMany({
      where: { id: invitation.id, status: 'booked' },
      data: { status: 'open', activeTargetKey: activeTargetKey(invitation.consignmentId, invitation.kind) },
    });

    await this.audit.logAction({
      action: 'delivery_slot.booking_cancelled',
      entityType: 'DeliverySlotBooking',
      entityId: booking.id,
      summary: 'Zeitfenster storniert',
      metadata: auditSafeSlotMetadata({ slotId: booking.slotId, kind: invitation.kind }),
    });

    await this.invalidateOpenProposals(invitation.consignmentId, invitation.tenantId);

    return { cancelled: true };
  }

  /** Kiracinin dilimi — sabit varsayilan YOK, kayittan okunuyor. */
  private async resolveTenantTimeZone(): Promise<string> {
    const tenantId = TenantContext.getTenantId();
    if (!tenantId) {
      throw new ForbiddenException({ code: 'slot_tenant_context_missing' });
    }
    const tenant = await this.prisma.unscoped.tenant.findUnique({
      where: { id: tenantId },
      select: { timezone: true },
    });
    if (!tenant) {
      throw new NotFoundException({ code: 'slot_tenant_not_found' });
    }
    return tenant.timezone;
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
