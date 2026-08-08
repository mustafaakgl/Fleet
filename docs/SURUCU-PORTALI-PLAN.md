# Sürücü Portalı — Çalışma Planı

**Güncellendi:** 2026-08-07 · **Kapsam:** web sürücü portalı (`app/(driver-portal)`) · **Mobil dokunulmuyor**

## Durum özeti

| # | İş | Durum |
|---|---|---|
| 0 | Service worker eski sürümü servis ediyor | ✅ bitti |
| 1 | Görünür kusurlar (durum etiketi, alt menü) | ✅ bitti |
| 2 | Ana sayfa → günün fazına göre tek eylem | ✅ bitti |
| 3 | Abfahrtskontrolle (günlük araç kontrolü) | ✅ bitti |
| 4 | Tur ekranı — göster | ✅ bitti |
| 5 | Arıza bildirimi + yakıt girişi | ✅ bitti |
| 6 | Kalan sürüş süresi | ⬜ sırada |
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

## Adım 0 — Service worker ✅

**Teşhis düzeltmesi.** Bu ilk raporlandığında "üretim riski, düzeltmeler sürücüye ulaşmıyor"
denmişti. Ölçünce yanlış çıktı: sorun **dev'e özeldi.**

| Ortam | Chunk adı | Cache-first sonucu |
|---|---|---|
| Dev | `…/driver/page.js` — hash yok | Eski sürüm kalıcı olarak sabitleniyor |
| Üretim | `1255-eae4096fb21f1304.js` — hash'li | Yeni build = yeni URL = taze içerik |

Yani üretimde uygulama güncellemeleri sürücüye zaten ulaşıyordu. Yaşanan kırılma dev'deydi:
`isStaticAsset` `/_next/static/`'i kapsıyor ve işleyici cache-first'tü, dev chunk adları
sabit olduğu için ilk sürüm sonsuza kadar sabitleniyordu.

**Yapılan.**

- **Dev'de kayıt yok.** Dev'de service worker önbelleğinin faydası yok, zararı bu. Ayrıca daha
  önce kaydı olan tarayıcılar kendiliğinden kurtarılıyor (`unregister` + `driver-portal-shell-*`
  önbelleklerinin silinmesi), yoksa o makineler sebebi belirsiz şekilde takılı kalırdı.
- **Önbellek sürümleniyor.** `CACHE_NAME` sabit `-v1`'di, `activate` içindeki temizlik *başka*
  adlı önbellekleri sildiği için hiçbir zaman silecek bir şey bulamıyordu; sürücünün telefonunda
  her deploy'un hash'li chunk'ları süresiz birikiyordu. Artık kayıt URL'indeki `?v=` sürümünden
  türetiliyor ve sürüm build anında git sha'sından geliyor.
- **Güncelleme banner'ı artık işliyor.** `install` içindeki `skipWaiting()` kaldırıldı: yeni worker
  hemen devralınca `waiting` durumu hiç oluşmuyordu, banner ise yalnızca bekleyen worker'ı
  izlediği için ölü koddu — üstelik çalışan sayfanın altından kod değişiyordu. Artık worker
  bekliyor, banner çıkıyor, sürücü uygun anda yeniliyor. Banner mevcut `SKIP_WAITING` mesajını
  gönderiyor (o işleyici vardı ama kimse çağırmıyordu) ve devir tamamlanınca sayfayı yeniliyor.
- **Statik varlıklar stale-while-revalidate.** Hash'li adlarda iki strateji de doğru, ama sabit
  adlı herhangi bir varlık artık ilk sürümüne çivilenmiyor; önbellekten servis edilip arka planda
  tazeleniyor.

**Doğrulama.** Dev: önceden kaydı olan tarayıcıda sayfa açıldığında kayıt sayısı 0'a düşüyor ve
`driver-portal-shell-*` önbellekleri siliniyor (tarayıcıda ölçüldü). Üretim: `npm run verify`
çıktısında paket `serviceWorker.register("/driver-portal-sw.js" + "?v=" + encodeURIComponent("7b00c8b"))`
içeriyor — sürüm git sha'sından gömülüyor.

**Kalan bilinen sınır.** Sürüm git sha'sından geliyor; `.git` olmayan bir ortamda (ör. Docker)
`npm_package_version`'a düşüyor ve o deploy başına değişmez. O ortamda `NEXT_PUBLIC_SW_VERSION`
CI tarafından verilmeli.

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

## Adım 3 — Abfahrtskontrolle ✅

**Neden şimdi.** Backend tam hazır (`GET status`, `POST submit`), faz makinesinde kapının yeri
zaten kodlanmış, yasal olarak günlük zorunlu ve sürücü bunu web'den hiç yapamıyor. Adım 2'yi
tamamlayan en ucuz iş.

**Yapılacak.** `/driver/departure-check` sayfası; `GET status` ile bugünün durumu, `POST submit`
ile gönderim, foto desteği. Ana sayfada `departureCheckDone` gerçek veriye bağlanır. Kusur
bulunursa arıza bildirimine bağlanır (Adım 5).

**Ayrım.** Mevcut `/driver/morning-checkin` araç plakası + firma + yük soruyor; bu bir *tur
başlangıç beyanı*, güvenlik kontrolü değil. İkisi ayrı kalır.

**Yapılan.** `/driver/departure-check` sayfası: şablon kalemleri sıralı, kalem başına
uygun/kusurlu/geçersiz, kusurda açıklama + ağırlık + fotoğraf. Form eksikken gönderim kilitli
(kalan madde, eksik açıklama, eksik zorunlu fotoğraf ayrı ayrı bildiriliyor). Ana sayfada
`departureCheckDone` gerçek veriye bağlandı.

Karar gereği **kusur turu bloke etmiyor** — kayda geçer, ofise gider, sürücü yoluna devam eder.
Bloke eden tek şey aracın zaten açık kritik kusuru olması; o kural backend'de
(`blocks_departure_check`) ve sayfa yalnızca bildiriyor. O durumda ana sayfa kapısı da devreye
girmiyor, yoksa sürücü kimsenin açamayacağı bir kapıya çarpardı.

Tip tarafında yeni tip icat edilmedi: ofis tarafındaki `DepartureCheckItemStatus` ve
`DefectSeverity` kullanıldı.

**Doğrulanan.** Şablon 7 gerçek kalemle geliyor (Reifen, Bremsen, Beleuchtung, Spiegel,
Ladungssicherung, Verbandkasten, Warndreieck). Kusur işaretlenince açıklama + ağırlık + foto
alanları açılıyor ve gönderim kilitleniyor. Hepsi işaretlenince kilit kalkıyor, gönderim
`DepartureCheck` + 7 `DepartureCheckItemResult` satırı yazıyor. Engelli araçta "Araç kilitli"
ekranı gerçek kusur adıyla çıkıyor. Ana sayfa kontrol yokken `departure_check` fazında kalıyor ve
"Turu başlat" sunmuyor; kontrol yapılınca `start_tour`'a geçiyor.

**Not.** Backend'de "onarıldı" (`behoben`) aracı açmıyor; yalnızca `bestaetigt` açıyor. Yani
kusuru tamir etmek yetmiyor, ofisin teyit etmesi gerekiyor.

## Adım 4 — Tur ekranı (göster) ✅

**Yapılacak.** `GET driver/tours/today` ile durak listesi, sıra, adres, zaman penceresi, harita
uygulamasına derin bağlantı. `mobile-driver/src/lib/navigation-links.ts` derin bağlantıları
çözüyor; ortak yardımcıya çıkarılıp web'de de kullanılır (mobil dosyaya dokunmadan).

Salt okunur olduğu için ekran da salt okunur olur; durum güncelleme Adım 7'de.

**Yapılan.** `/driver/tour`: özet kartı (durak sayısı + planlanan km), sıralı duraklar, alış/teslim
etiketi, zaman penceresi, planlanan varış ve durak başına navigasyon bağlantısı. `on_tour` fazının
birincil eylemi artık göreve değil tura gidiyor.

Navigasyon yardımcısı `frontend/lib/navigation-links.ts` olarak **kopyalandı**, import edilmedi:
frontend Docker imajı yalnızca `frontend/` bağlamından kuruluyor (`COPY . .`), yani paketler arası
import üretim build'ini kırardı. İki kopyanın sessizce ayrışmaması için aynı URL kurallarını
kilitleyen 14 test yazıldı ve `loop-verify.mjs`'e kaydedildi.

**Yakalanan hata.** `truckAccess` ilk yazımda `boolean` sanılmıştı; aslında enum
(`unknown | reachable | unreachable | check_failed`) ve `=== false` kontrolü hiçbir zaman doğru
olmayacaktı. Mobil ekran doğru yapıyordu — referans alındı: `unreachable` kırmızı bulgu,
`reachable` dışındaki her şey sarı "doğrulanmadı" notu.

**Doğrulanan.** Ekran gerçek turla açıldı (2 durak, biri `reachable` biri `unreachable`):
sıra, adres, pencere, planlanan varış ve kırmızı "kamyon giremiyor" uyarısı doğru çıktı.
Navigasyon bağlantıları adres değil koordinat taşıyor
(`…destination=52.532100,13.384600&travelmode=driving`). Tur yokken boş durum çıkıyor; taslak
turlar backend tarafından zaten gizleniyor.

**Not.** Tur adı büyük harfe çevrilmiyordu değil — çevriliyordu ve Türkçe dil kuralı "Berlin"i
"BERLİN" yapıyordu. Etiketler büyütülür, kullanıcı verisi büyütülmez.

## Adım 5 — Arıza bildirimi + yakıt girişi ✅

**Yapılan.** `DriverReportsForm`'a üçüncü kart olarak araç arızası eklendi (marka yeni sayfa değil,
mevcut formun genişlemesi). Yakıt için yeni `/driver/fuel`.

Yakıt sayfası hiçbir menüden erişilemez kalmasın diye ana sayfada `on_tour` fazına ikincil bağlantı
olarak kondu — sürücü yakıtı tur sırasında alıyor. (Raporlardaki B2 bulgusu tam olarak buydu:
sayfa var, hiçbir yerden bağlı değil.)

**Yakalanan backend kuralı.** `POST driver/defects/report` **en az bir fotoğraf** şart koşuyor;
form ilk halinde bunu bilmiyordu ve gönderim 400 ile dönüyordu. Artık foto zorunlu olarak
işaretli, gönderimden önce kontrol ediliyor.

**Yol üstünde düzeltilen.** Formdaki mevcut iki gönder butonu `bg-brand-primary` kullanıyordu —
ölü token olduğu için arka planları hiç yoktu. Çalışan sınıflara çevrildi. Sayfa alt başlığı
"kaza ve yük hasarı" diyordu, artık arızayı da anıyor.

**Doğrulanan.** Yakıt: 412,5 L · 698,30 € · 184.320 km · dolu depo kaydedildi; virgüllü ondalıklar
doğru çözüldü. Arıza: fotoğrafla gönderim başarılı, fotoğrafsız gönderim formda engelleniyor.
İki test kaydı da silindi (arıza `kritisch/offen` olduğu için bırakılsaydı o aracın
Abfahrtskontrolle'sini bloke ederdi).

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
