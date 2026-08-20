import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { DeliverySlotService } from './delivery-slot.service';
import { BookSlotDto } from './dto/delivery-slot.dto';

/**
 * TESLIMAT SLOTU — PUBLIC (Faz 17f).
 *
 * GIRIS YOK. Yetki tek bir seyden geliyor: token. Bu yuzden yuzey MUMKUN
 * OLDUGUNCA DAR ve her karar ona gore verildi.
 *
 * TOKEN BASLIKTA, URL'DE DEGIL. `?token=` ile tasinsaydi ters vekil
 * loglarina, tarayici gecmisine ve `Referer` basligina duserdi — uc de
 * kalicidir ve hicbiri bizim kontrolumuzde degil. Repodaki
 * `x-ordivan-lease-token` ile AYNI desen.
 *
 * KIRACI ISTEMCIDEN ALINMAZ: token'in kendisi kiraciyi belirler
 * (bkz. `resolveInvitation`). Govdede ya da baslikta `tenantId` diye bir sey
 * YOK ve olsaydi kiraci sinirini istemci belirlerdi.
 *
 * HIZ SINIRI ROTA UZERINDE, SERVISTE DEGIL.
 * `@Throttle` global `ThrottlerGuard` tarafindan HANDLER'DAN okunuyor; yani
 * sinir istegi CONTROLLER'A GIRMEDEN uyguluyor. Servisteki `attemptCount`
 * kilidi kaldirilmiyor — ikisi FARKLI SEYI koruyor:
 *
 *   - `@Throttle` KAYNAK BASINA: bir IP'nin token TAHMIN etmesini yavaslatir.
 *   - `attemptCount`/`lockedUntil` DAVET BASINA: IP degistirerek ayni linki
 *     sinirsiz denemeyi engeller.
 *
 * Yalnizca servis katmanindaki sayac olsaydi, her deneme once bir
 * veritabani sorgusu harcardi ve sinir asilana kadar yuzlerce sorgu acilirdi.
 * Yalnizca `@Throttle` olsaydi, IP havuzu olan biri sinirsiz denerdi.
 *
 * BUTUN BASARISIZ SONUCLAR AYNI CEVABI VERIR: gecersiz, suresi dolmus, iptal
 * edilmis, kilitli, bayat revizyonlu ve BASKA KIRACIYA ait token — hepsi
 * `404 { code: 'slot_invitation_invalid' }`. Ayirt edilebilselerdi saldirgan
 * kalemin VARLIGINI ogrenirdi.
 */
@Controller('public/delivery-slots')
@Public()
// Sinir CONTROLLER duzeyinde: her uc icin ayni. Bir uca daha yuksek sinir
// verilseydi saldirgan en gevsek olani secerdi.
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class PublicSlotController {
  constructor(private readonly slots: DeliverySlotService) {}

  /**
   * Davetin gorebilecegi slotlar.
   *
   * YANIT DAR: yalnizca zaman, dilim, kaynak referansi ve musaitlik.
   * Kiraci adi, siparis ic yapisi, fiyat, arac, surucu, yuk detayi, token
   * ozeti ve denetim bilgisi YOK — link sizarsa ogrenilebilecek sey "su
   * depoda su saatlerde yer var"dan ibaret.
   */
  @Get()
  listSlots(@Headers('x-slot-token') token?: string) {
    return this.slots.listSlots(token ?? '');
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
  book(@Body() dto: BookSlotDto, @Headers('x-slot-token') token?: string) {
    return this.slots.book(token ?? '', dto.slotId);
  }

  /**
   * Rezervasyon iptali.
   *
   * IDEMPOTENT: aktif rezervasyon yoksa hata degil, `cancelled: false` doner.
   * Ikinci bir iptal istegi bir HATA gibi gorunseydi, musteri ilk iptalinin
   * gecmedigini sanip destege yazardi.
   */
  @Post('bookings/cancel')
  @HttpCode(200)
  cancel(@Headers('x-slot-token') token?: string) {
    return this.slots.cancelBooking(token ?? '');
  }
}
