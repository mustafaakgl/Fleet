import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { SAFE_INVITATION_ERROR } from './core/delivery-slot-security';
import { auditSafeSlotMetadata } from './core/dispatch-field-security';

/**
 * SLOT OTURUMU (Faz 17g).
 *
 * PROBLEM: davet linki token'i tasimak zorunda ama token URL'de KALMAMALI.
 * `?token=` ya da `/slot/<token>` bicimleri token'i ters vekil loglarina,
 * tarayici gecmisine ve `Referer` basligina dusururdu — ucu de bizim
 * kontrolumuz disinda ve ucu de kalici.
 *
 * COZUM: token URL FRAGMENT'inda geliyor (`#token=...`). Fragment sunucuya
 * HIC gonderilmez ve `Referer` ile de tasinmaz. Sayfa onu BIR KEZ buraya
 * gonderip yerine kisa omurlu bir HttpOnly cookie aliyor, sonra fragment'i
 * `history.replaceState` ile siliyor. Sonraki her istek cookie ile gidiyor;
 * token bir daha JavaScript'ten okunabilir bir yerde durmuyor.
 *
 * OTURUM DAVETTEN FAZLA YETKI VERMEZ: `resolve` her cagrida daveti YENIDEN
 * okur ve cagiran taraf onu yeniden degerlendirir. Davet iptal edilir,
 * suresi dolar ya da siparis revize edilirse acik oturum da o anda ise
 * yaramaz olur — oturum bir kopya degil, bir ISARETCIDIR.
 */

export const SLOT_SESSION_COOKIE = 'fleet_slot_session';

/**
 * OTURUM OMRU DAVETTEN COK DAHA KISA.
 *
 * Davet gunlerce gecerli olabilir; oturum dakikalarla olculur. Paylasilan
 * bir bilgisayarda acik unutulan sekme, saatler sonra baskasinin randevuyu
 * degistirmesine izin vermemeli.
 */
export const SLOT_SESSION_TTL_MS = 30 * 60 * 1000;

function isSecureCookies(): boolean {
  if ((process.env.COOKIE_SECURE ?? '').toLowerCase() === 'false') return false;
  return process.env.NODE_ENV === 'production';
}

/**
 * Cookie secenekleri.
 *
 * `httpOnly`: JavaScript okuyamaz — XSS oturumu calamaz.
 * `secure`: uretimde yalnizca HTTPS.
 * `sameSite: 'strict'`: public sayfa API ile AYNI kaynakta (Next rewrite
 *   `/api/v1/*`'i backend'e tasiyor), dolayisiyla `strict` hicbir mesru akisi
 *   bozmuyor ve CSRF yuzeyini tamamen kapatiyor. `lax` secseydik ucuncu
 *   taraf bir sayfadan gelen GET istegi cookie'yi tasirdi.
 * `path`: yalnizca public slot uclari. Baska hicbir uca gonderilmiyor.
 */
export function slotSessionCookieOptions(maxAgeMs?: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isSecureCookies(),
    sameSite: 'strict',
    path: '/api/v1/public/delivery-slots',
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

export interface SlotSessionContext {
  sessionId: string;
  invitationId: string;
  tenantId: string;
}

@Injectable()
export class DeliverySlotSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Davet token'ini oturuma cevirir.
   *
   * ONCEKI OTURUMLAR KAPATILIYOR: bir davetin ayni anda bir tarayicida acik
   * olmasi yeterli. Link yeniden acildiginda eskisinin gecerli kalmasi,
   * paylasilan bir cihazda birakilmis oturumu sessizce yasatirdi.
   */
  async create(
    invitationId: string,
    tenantId: string,
    res: Response,
  ): Promise<{ expiresAt: string }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SLOT_SESSION_TTL_MS);

    await this.prisma.unscoped.deliverySlotSession.updateMany({
      where: { invitationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.prisma.unscoped.deliverySlotSession.create({
      data: { tenantId, invitationId, tokenHash: this.hash(token), expiresAt },
      select: { id: true },
    });

    res.cookie(SLOT_SESSION_COOKIE, token, slotSessionCookieOptions(SLOT_SESSION_TTL_MS));

    await this.audit.logAction({
      action: 'delivery_slot.session_opened',
      entityType: 'DeliverySlotInvitation',
      entityId: invitationId,
      summary: 'Zeitfenster-Sitzung geoeffnet',
      // TOKEN, OZET VE OTURUM KIMLIGI DENETIME GIRMEZ.
      metadata: auditSafeSlotMetadata({ invitationId, expiresAt: expiresAt.toISOString() }),
    });

    return { expiresAt: expiresAt.toISOString() };
  }

  /**
   * Cookie'yi davete cozer.
   *
   * BASARISIZ HER SONUC AYNI CEVABI VERIR: cookie yok, bilinmiyor, suresi
   * dolmus ve iptal edilmis — dordu de `slot_invitation_invalid`. Ayirt
   * edilebilselerdi saldirgan gecerli bir oturum kimliginin VARLIGINI
   * ogrenirdi.
   */
  async resolve(rawCookie: string | undefined): Promise<SlotSessionContext> {
    if (!rawCookie || rawCookie.length < 20) {
      throw new NotFoundException(SAFE_INVITATION_ERROR);
    }

    const session = await this.prisma.unscoped.deliverySlotSession.findUnique({
      where: { tokenHash: this.hash(rawCookie) },
      select: { id: true, invitationId: true, tenantId: true, expiresAt: true, revokedAt: true },
    });

    const now = new Date();
    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= now.getTime()) {
      throw new NotFoundException(SAFE_INVITATION_ERROR);
    }

    await this.prisma.unscoped.deliverySlotSession.updateMany({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });

    return { sessionId: session.id, invitationId: session.invitationId, tenantId: session.tenantId };
  }

  /**
   * Oturumu kapatir — SATIR SILINMEZ, damgalanir.
   *
   * Cookie'yi yalnizca tarayicidan silseydik, kopyalanmis bir cookie hala
   * gecerli olurdu. Iptal SUNUCUDA.
   */
  async revoke(rawCookie: string | undefined, res: Response): Promise<{ closed: boolean }> {
    res.clearCookie(SLOT_SESSION_COOKIE, slotSessionCookieOptions());
    if (!rawCookie) return { closed: false };

    const claimed = await this.prisma.unscoped.deliverySlotSession.updateMany({
      where: { tokenHash: this.hash(rawCookie), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { closed: claimed.count > 0 };
  }

  /** Davet iptal/yenilendiginde acik oturumlari da kapatir. */
  async revokeForInvitation(invitationId: string): Promise<void> {
    await this.prisma.unscoped.deliverySlotSession.updateMany({
      where: { invitationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
