# Sürücü Portalı — Çalışma Planı

**Güncellendi:** 2026-08-07 · **Kapsam:** web sürücü portalı (`app/(driver-portal)`) · **Mobil dokunulmuyor**

## Durum özeti

| # | İş | Durum |
|---|---|---|
| 0 | Service worker eski sürümü servis ediyor | ⛔ **engelleyici** |
| 1 | Görünür kusurlar (durum etiketi, alt menü) | ✅ bitti |
| 2 | Ana sayfa → günün fazına göre tek eylem | ✅ bitti |
| 3 | Abfahrtskontrolle (günlük araç kontrolü) | ⬜ sırada |
| 4 | Tur ekranı — göster | ⬜ |
| 5 | Arıza bildirimi + yakıt girişi | ⬜ |
| 6 | Kalan sürüş süresi | ⬜ |
| 7 | Durak durumu ("vardım / teslim ettim") | ⬜ tasarım kararı bekliyor |
| — | Token katmanını dirilt | ⬜ ayrı iş, 53 dosya |
| — | Ehliyet kontrolü · cezalar · seferler · skor | ⬜ sonraki tur |

## Çıkış noktası

Sürücü tarafı bir özellik eksiği değil, **arayüz eksiği.** Backend'de sürücüye özel sekiz uç var,
web portalı hiçbirini kullanmıyor. Uçların fiilleri tek tek doğrulandı (2026-08-07):

| Uç | Sunduğu fiiller | Yazma | Adım |
|---|---|---|---|
| `driver/departure-check` | `GET status`, `POST submit`, `GET …/photo` | ✅ | 3 |
| `driver/defects` | `GET`, `POST report`, `POST :id/confirm`, foto | ✅ | 5 |
| `driver/fleet/fuel-entries` | `POST`, `GET` | ✅ | 5 |
| `driver/license-check` | `GET status`, `GET history`, `POST submit` | ✅ | sonraki tur |
| `driver/fines` | `GET`, `GET :id`, `POST :id/acknowledge`, belge | ✅ | sonraki tur |
| `driver/fleet/trips` | `POST start`, `POST :id/stop`, `POST :id/locations`, `GET` | ✅ | sonraki tur |
| `driver/fleet/score` | `GET score` | okuma yeterli | sonraki tur |
| **`driver/tours`** | **`GET today` — başka fiil yok** | ❌ | 4 / 7 |

**Tek gerçek backend işi turda.** Diğer yedisinde yalnızca arayüz yazılacak.

Ayrıca `driver/assignments` da salt okunur (`GET today`, `GET :id`) — sürücü bir görevi
`in_progress`'e çekemiyor. Ana sayfa bu yüzden turun başladığını **bugünkü check-in'in
varlığından** anlıyor.

## Verilen kararlar

Bunlar sorulup karara bağlandı, yeniden tartışılmadan uygulanır:

- **Abfahrtskontrolle sert kapıdır** — kontrol yapılmadan tur başlatılamaz.
- **Sabah check-in ayrı adım değildir** — tur başlatmanın içinde, görevden otomatik dolar.
- **Mesai ilk eylemle açılır**, ayrı düğmesi yoktur. Ekran bunu açıkça yazar; sürücü saatin ne
  zaman başladığını bilmek zorunda (Arbeitszeiterfassung açısından itiraza açık bir tercih,
  bilinerek yapıldı).
- **Görevi olmayan sürücü** "bugün planlı işin yok" + talep kısayolu görür.

---

## Adım 0 — Service worker ⛔ ENGELLEYİCİ

**Sorun.** `/driver` kapsamında kayıtlı bir service worker (`public/driver-portal-sw.js`,
`hooks/useDriverPortalServiceWorker.ts` ile kaydediliyor) `driver-portal-shell-v1` önbelleğinden
eski kabuğu sunuyor. Adım 2 doğrulanırken ölçüldü: dev sunucusu yeniden başlatıldı, `.next`
temizlendi, sayfa zorla yenilendi — **hiçbiri işe yaramadı.** Yalnızca `unregister()` +
`caches.delete()` sonrası yeni sürüm göründü.

**Neden önce bu.** Sürücü portalına ne yayınlarsak yayınlayalım sürücünün telefonuna ulaşmıyor.
Bu düzelmeden aşağıdaki adımların hiçbirinin sahada karşılığı olmaz.

**Bakılacaklar.** Cache adının sürümlenmesi (`-v1` elle mi artıyor?), `skipWaiting` /
`clients.claim` kullanımı, `DriverPortalUpdateBanner`'ın bekleyen worker'ı gerçekten algılayıp
algılamadığı (bu senaryoda hiç tetiklenmedi).

**Doğrulama.** Kod değiştirilip yeniden derlendiğinde, site verisi temizlenmeden yeni sürümün
geldiği tarayıcıda gösterilmeli.

## Adım 1 — Görünür kusurlar ✅

`translateStatus` bilinmeyen değer için anahtarı kendisi üretiyor ve `assignment` haritasında
`confirmed` yoktu; rozette ham anahtar görünüyordu. Haritaya eklendi, üç dile karşılığı yazıldı.
`translateStatus`'un referans verdiği 30 anahtarın üç dilde de tam olduğu topluca doğrulandı.

Alt menüde etiketler komşu sekmenin üstüne biniyordu: `truncate` vardı ama `items-center` span'i
içeriği kadar daralttığı için kırpacak sınır yoktu. `w-full text-center` eklendi; ayrıca
"Raporlar + bildirimler" hiçbir dilde beşte bir şeride sığmadığı için mevcut kısa
`nav.reports` anahtarına geçildi.

## Adım 2 — Ana sayfa ✅

Ana sayfa on bloğu eşit ağırlıkta diziyordu ve beş birincil eylem yarışıyordu; günün asıl işi olan
görev yedinci sıradaydı. Artık `lib/driver-day-phase.ts` günün fazını belirliyor ve ekran tek eylem
sunuyor: `no_assignment` · `departure_check` · `start_tour` · `on_tour` · `handover` · `end_shift` ·
`day_closed`.

Faz seçimi saf fonksiyonda; yanlış kural sürücüyü yanlış işe gönderdiği için render'sız test
edilebilmesi gerekiyordu. 13 test, `loop-verify.mjs`'e kayıtlı (frontend specleri orada elle
sayılan bir listeden koşuyor — kaydedilmezse hiç çalışmaz).

Konum kartı kaldırıldı (zaten profilde duruyordu), hızlı işlemler ızgarası ve üç yerde tekrarlanan
sayaçlar gitti.

**Açık kalan bağ:** `departureCheckDone` şimdilik `null` geçiliyor — Adım 3 bunu gerçek veriye
bağlayacak ve kapı devreye girecek.

## Adım 3 — Abfahrtskontrolle

**Neden şimdi.** Backend tam hazır (`GET status`, `POST submit`), faz makinesinde kapının yeri
zaten kodlanmış, yasal olarak günlük zorunlu ve sürücü bunu web'den hiç yapamıyor. Adım 2'yi
tamamlayan en ucuz iş.

**Yapılacak.** `/driver/departure-check` sayfası; `GET status` ile bugünün durumu, `POST submit`
ile gönderim, foto desteği. Ana sayfada `departureCheckDone` gerçek veriye bağlanır. Kusur
bulunursa arıza bildirimine bağlanır (Adım 5).

**Ayrım.** Mevcut `/driver/morning-checkin` araç plakası + firma + yük soruyor; bu bir *tur
başlangıç beyanı*, güvenlik kontrolü değil. İkisi ayrı kalır.

**Doğrulama.** Kontrol kaydı backend'e yazılıyor ve ofis tarafındaki `/departure-checks`
listesinde görünüyor; kontrol yapılmadan ana sayfa `start_tour` fazına geçmiyor.

## Adım 4 — Tur ekranı (göster)

**Yapılacak.** `GET driver/tours/today` ile durak listesi, sıra, adres, zaman penceresi, harita
uygulamasına derin bağlantı. `mobile-driver/src/lib/navigation-links.ts` derin bağlantıları
çözüyor; ortak yardımcıya çıkarılıp web'de de kullanılır (mobil dosyaya dokunmadan).

Salt okunur olduğu için ekran da salt okunur olur; durum güncelleme Adım 7'de.

**Doğrulama.** Sürücü hesabıyla tur açılıyor, duraklar doğru sırada, 375 px ekran görüntüsü.

## Adım 5 — Arıza bildirimi + yakıt girişi

`DriverReportsForm` bugün kaza + yük hasarını taşıyor; üçüncü tip olarak araç arızası eklenir
(`POST driver/defects/report`). Yeni sayfa değil, mevcut formun genişletilmesi.

Yakıt için yeni `/driver/fuel`, `POST driver/fleet/fuel-entries`'e bağlanır.

**Doğrulama.** Kayıtlar ofis tarafındaki `/defects` ve yakıt ekranlarında görünüyor.

## Adım 6 — Kalan sürüş süresi

561/2006 ihlalinde cezayı yiyen ve ehliyetini riske atan kişi sürücü, ama kalan sürüş ve mola
süresini yalnızca ofis görüyor (`tachograph/remaining-driving-time`). Ana sayfada kalıcı şerit.

**Risk.** Sürücüye gösterilen sayı yanlışsa güven kaybı büyük olur. Ofis ekranıyla birebir aynı
kaynaktan beslenmeli, arayüzde yeniden hesap yapılmamalı. Takograf kural motorunun mevcut 33
testiyle tutarlılık kontrol edilir.

## Adım 7 — Durak durumu ("vardım / teslim ettim")

**Önce karar.** Durak seviyesinde uç yok. İki yol var ve kod yazılmadan seçilmeli:

- `driver/fleet/trips` katmanını yeniden kullan (`POST start` / `stop` / `locations` zaten var),
- ya da `TourStop` için ayrı uç yaz.

Yeni Prisma alanı gerekirse CLAUDE.md 2. kural geçerli: migration + `tenant-scoped-models` +
`tenant-isolation-check` aynı commit içinde. Mobil ile web aynı sözleşmeyi paylaşmalı.

**Risk.** Planın en yüksek riskli adımı: yeni uç, yeni durum geçişleri, iki istemci.

---

## UX temeli — enine kesen

Ayrı adım değil, her adımın içinde uygulanır. Kullanım bağlamı tasarımı belirliyor: **kabinde,
aceleyle, çoğu zaman eldivenle, kötü şebekede, bazen gece.** Maddeler bundan türüyor.

**Adım 2'de uygulandı:** tek birincil buton (ekranda bir dolu buton, gerisi ikincil); 48 px
yükseklik ve tam genişlik (eldiven); hiyerarşi (karşılama tek satıra indi, "Şimdi" kartı baskın
öğe oldu); iskelet durumları (önceden bileşenler `null` dönüp ekranı boş bırakıyordu); anlamsal
renk (sarı = senin yapman gereken var, kırmızı = sorun bildir, yeşil = tamamlandı, mavi = bilgi).

**Sonraki adımlarda:**

- **Çevrimdışı görünürlüğü (Adım 4).** `DriverOfflineStatusBar` ve `driver-offline-queue-core`
  zaten var; eksik olan sürücünün kuyruğu görmesi — "3 kayıt gönderilmeyi bekliyor". Görmezse
  aynı şeyi tekrar tekrar gönderir.
- **Gece modu (Adım 6 ile).** `darkMode` hiç yapılandırılmamış. Sürücüler gece sürüyor; kabinde
  03:00'te bembeyaz ekran göz kamaştırır ve gece görüşünü bozar. Moda tercihi değil, sürüş
  güvenliğine dokunuyor. Token katmanı dirilmeden teknik olarak yapılamaz.

**Kapsam dışı:** yeni tasarım dili, yeni bileşen kütüphanesi, animasyon katmanı. Sorun eksiklik
değil, tutarsız kullanım.

## Ayrı iş — token katmanını dirilt

Proje Tailwind **4** kullanıyor. `app/globals.css` yalnızca `@import "tailwindcss"` ve iki
değişkenlik bir `@theme inline` bloğu içeriyor; **`@config` direktifi yok.** Tailwind 4'te
`tailwind.config.ts` ancak `@config` ile yüklenir, dolayısıyla oradaki `brand.*`, `surface.*`,
`text.*` paletinin tamamı hiç derlenmiyor. Tarayıcıda ölçüldü: `bg-brand-primary` → `rgba(0,0,0,0)`,
`text-brand-primary` → `rgb(0,0,0)`, `bg-slate-200` → çalışıyor.

Bu, portaldaki gömülü hex'leri açıklıyor: geliştiriciler tasarım sisteminden sapmamış, **token hiç
çalışmadığı için** hex yazmak zorunda kalmışlar.

**Neden ayrı iş.** `brand-primary` 53 dosyada, `bg-surface` 27 dosyada geçiyor — hepsi ölü.
Tokenları açmak bu dosyaların rengini aynı anda değiştirir; sürücü portalını çok aşar ve kendi
görsel doğrulama turunu gerektirir. Adım 2 bu yüzden yerleşik paleti anlamsal rollere bağlayarak
ilerledi.

**Yapılacak.** `globals.css`'e `@theme` ile paleti taşı (veya `@config` ekle), sonra 53 dosyayı
görsel olarak gözden geçir. Gece modu buna bağlı.

## Kapsam dışı

- Mobil uygulama (`mobile-driver/`) — dokunulmuyor
- Ofis/dashboard tarafı — yalnızca doğrulama amaçlı okunur
- `MOBIL-DENETIM.md`'deki 3-7 numaralı bulgular (pazarlama sayfası taşmaları, araç fotoğrafı
  404'leri, yanlış rolde boş portal ekranı, sabit İngilizce metinler, alt menü çakışması) — ayrı iş
