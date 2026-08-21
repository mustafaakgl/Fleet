import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { DeliverySlotService, type SlotCredential } from './delivery-slot.service';
import {
  DeliverySlotSessionService,
  SLOT_SESSION_COOKIE,
} from './delivery-slot-session.service';
import { BookSlotDto, OpenSlotSessionDto } from './dto/delivery-slot.dto';

/**
 * TESLIMAT SLOTU — PUBLIC (Faz 17f/17g).
 *
 * GIRIS YOK. Yetki tek bir seyden geliyor: davet. Bu yuzden yuzey MUMKUN
 * OLDUGUNCA DAR ve her karar ona gore verildi.
 *
 * IKI KIMLIK YOLU, TEK KAPI:
 *   1. `x-slot-token` basligi — makine/entegrasyon sozlesmesi, 17f'den
 *      DEGISMEDEN duruyor.
 *   2. `fleet_slot_session` HttpOnly cookie — tarayici akisi (17g).
 * Ikisi de serviste AYNI degerlendirmeden geciyor; ikinci bir yol acmak,
 * gevsek olanin sessizce acik kalmasi demek olurdu.
 *
 * TOKEN NEDEN URL'DE DEGIL: davet linki token'i FRAGMENT'ta tasiyor
 * (`/public/delivery-slot#token=...`). Fragment sunucuya HIC gitmez ve
 * `Referer` ile de tasinmaz. Sayfa onu bir kez `POST session`a verip yerine
 * cookie aliyor ve fragment'i hemen siliyor. `?token=` olsaydi token ters
 * vekil loglarina, tarayici gecmisine ve `Referer` basligina duserdi.
 *
 * HIZ SINIRI ROTA UZERINDE, SERVISTE DEGIL: `@Throttle` global
 * `ThrottlerGuard` tarafindan HANDLER'DAN okunuyor ve istegi CONTROLLER'A
 * GIRMEDEN durduruyor. Servisteki davet basina kilit KALDIRILMADI — ikisi
 * farkli seyi koruyor: `@Throttle` kaynak basina (token tahminini
 * yavaslatir), `attemptCount` davet basina (IP degistirerek ayni linki
 * sinirsiz denemeyi engeller).
 *
 * BUTUN BASARISIZ SONUCLAR AYNI CEVABI VERIR: gecersiz, suresi dolmus, iptal
 * edilmis, kilitli, bayat revizyonlu, BASKA KIRACIYA ait token ve gecersiz
 * oturum — hepsi `404 { code: 'slot_invitation_invalid' }`.
 */
@Controller('public/delivery-slots')
@Public()
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PublicSlotController {
  constructor(
    private readonly slots: DeliverySlotService,
    private readonly sessions: DeliverySlotSessionService,
  ) {}

  /**
   * Token -> kisa omurlu oturum. TOKEN BIR KEZ gonderilir.
   *
   * Token govdede ya da baslikta kabul ediliyor; ikisi de URL'de DEGIL.
   * Yanit token'i geri DONDURMEZ — donduren bir uc, token'i tarayici
   * belleginde ve hata loglarinda yeniden gorunur kilardi.
   */
  @Post('session')
  @HttpCode(201)
  async openSession(
    @Body() dto: OpenSlotSessionDto,
    @Res({ passthrough: true }) response: Response,
    @Headers('x-slot-token') headerToken?: string,
  ) {
    const invitation = await this.slots.openSession(dto.token ?? headerToken ?? '');
    const session = await this.sessions.create(
      invitation.invitationId,
      invitation.tenantId,
      response,
    );
    // Yalnizca ne turde bir randevu oldugu ve oturumun ne zaman bitecegi.
    return { kind: invitation.kind, expiresAt: session.expiresAt };
  }

  /** Oturumu kapatir. Cookie siliniyor VE sunucudaki satir damgalaniyor. */
  @Delete('session')
  @HttpCode(200)
  closeSession(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.sessions.revoke(this.cookie(request), response);
  }

  /**
   * Davetin gorebilecegi slotlar.
   *
   * YANIT DAR: yalnizca zaman, dilim, kaynak referansi ve musaitlik. Kiraci,
   * siparis ic yapisi, fiyat, arac, surucu, yuk detayi, token ozeti ve
   * denetim bilgisi YOK — link sizarsa ogrenilebilecek sey "su depoda su
   * saatlerde yer var"dan ibaret.
   */
  @Get()
  async listSlots(@Req() request: Request, @Headers('x-slot-token') token?: string) {
    return this.slots.listSlots(await this.credential(request, token));
  }

  /**
   * Slot secimi.
   *
   * DEGISIKLIK DE BU UCTAN: farkli bir `slotId` gonderildiginde onceki
   * rezervasyon birakilir ve yenisi alinir. Ayni `slotId` tekrar
   * gonderildiginde MEVCUT rezervasyon doner ve kontenjan IKINCI KEZ
   * tuketilmez.
   */
  @Post('bookings')
  @HttpCode(201)
  async book(
    @Body() dto: BookSlotDto,
    @Req() request: Request,
    @Headers('x-slot-token') token?: string,
  ) {
    return this.slots.book(await this.credential(request, token), dto.slotId);
  }

  /**
   * Rezervasyon iptali.
   *
   * IDEMPOTENT: aktif rezervasyon yoksa hata degil, `cancelled: false` doner.
   * Ikinci bir iptal istegi HATA gibi gorunseydi, musteri ilk iptalinin
   * gecmedigini sanip destege yazardi.
   */
  @Post('bookings/cancel')
  @HttpCode(200)
  async cancel(@Req() request: Request, @Headers('x-slot-token') token?: string) {
    return this.slots.cancelBooking(await this.credential(request, token));
  }

  /**
   * BASLIK ONCE, COOKIE SONRA.
   *
   * Baslik acikca gonderilmis bir niyettir; cookie tarayicinin otomatik
   * ekledigi bir seydir. Ters sirada olsaydi, bir entegrasyon acik bir
   * tarayici oturumunun cerezini yanlislikla kullanabilirdi.
   */
  private async credential(request: Request, headerToken?: string): Promise<SlotCredential> {
    if (headerToken && headerToken.trim()) return headerToken.trim();
    const session = await this.sessions.resolve(this.cookie(request));
    return { kind: 'session', invitationId: session.invitationId };
  }

  private cookie(request: Request): string | undefined {
    const jar = (request as Request & { cookies?: Record<string, string> }).cookies;
    return jar?.[SLOT_SESSION_COOKIE];
  }
}
