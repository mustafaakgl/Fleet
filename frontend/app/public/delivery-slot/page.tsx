import type { Metadata } from 'next';
import { PublicSlotBooking } from '@/components/delivery-slots/PublicSlotBooking';

/**
 * GIRISSIZ SLOT SAYFASI (Faz 17g).
 *
 * `noindex, nofollow`: bu adres bir arama sonucunda gorunmemeli. Sayfanin
 * kendisi token tasimasa da, indekslenen bir randevu sayfasi kiracinin
 * musteri iliskisini disariya bildirirdi.
 *
 * `referrer: 'no-referrer'`: sayfadan cikan hicbir istek bu adresi
 * `Referer` basliginda tasimasin. Fragment zaten `Referer` ile gitmez ama
 * ADRESIN KENDISI de disariya sizmamali — hangi kiracinin sayfasi oldugu
 * bile bir bilgidir.
 *
 * UCUNCU TARAF SCRIPT YOK: bu agacta analytics, etiket yoneticisi ya da
 * harici bir widget YUKLENMIYOR ve `next.config.ts` icindeki CSP bunu
 * ayrica zorluyor (`script-src 'self'`, `connect-src 'self'`). Bir analytics
 * script'i sayfadaki her seyi — secilen saat dahil — ucuncu bir tarafa
 * tasiyabilirdi.
 */
export const metadata: Metadata = {
  title: 'Zeitfenster',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function PublicDeliverySlotPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <PublicSlotBooking />
    </main>
  );
}
