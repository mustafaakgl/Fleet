# Sürücü Portalı — Çalışma Planı

**Başlangıç:** 2026-08-07 · **Kapsam:** web sürücü portalı (`app/(driver-portal)`) · **Mobil dokunulmuyor**

Çıkış noktası: sürücü tarafı bir özellik eksiği değil, **arayüz eksiği**. Backend'de sürücüye özel
sekiz uç hazır ve web portalı bunların çoğunu hiç çağırmıyor.

| Backend'de hazır | Web portalında | Plan adımı |
|---|---|---|
| `driver/tours` (yalnızca okuma) | ❌ | 3a |
| `driver/departure-check` | ❌ | 4 |
| `driver/defects` | ❌ | 6 |
| `driver/fleet/fuel-entries` | ❌ | 6 |
| `driver/license-check` | ❌ | sonraki tur |
| `driver/fines` | ❌ | sonraki tur |
| `driver/fleet/trips` | ❌ | sonraki tur |
| `driver/fleet` (sürüş skoru) | ❌ | sonraki tur |

Her adım kendi başına sevk edilebilir. Her adımın sonunda doğrulama bataryası (CLAUDE.md) yeşil
olmadan bir sonrakine geçilmez.

---

## Adım 1 — Görünür kusurlar ✅ TAMAMLANDI

**Hedef.** Ekranda duran iki bozukluğu kaldırmak.

**Yapılan.**
- `lib/driver-portal-utils.ts` — `assignment` durum haritasına `confirmed` eklendi. `translateStatus`
  bilinmeyen değer için anahtarı kendisi üretiyor; `confirmed` haritada olmadığı için ham anahtar
  ekrana basılıyordu (`DRİVERPORTAL.STATUS.ASSİGNMENT.CONFİRMED`). Aynı dosyadaki renk fonksiyonu
  `confirmed`'i zaten tanıyordu, yalnızca etiket unutulmuş.
- `src/locales/{de,en,tr}/common.json` — `driverPortal.status.assignment.confirmed` eklendi
  (Bestätigt / Confirmed / Onaylandı).
- `components/driver-portal/DriverPortalNav.tsx` — etiket `<span>`'ine `w-full text-center`.
  `truncate` vardı ama `items-center` span'i içeriği kadar daralttığı için kırpacak sınır yoktu ve
  etiketler komşu sekmenin üstüne biniyordu. Ayrıca `reportsNotifications` yerine mevcut kısa
  `driverPortal.nav.reports` anahtarı kullanıldı; bildirim kısmını zaten kırmızı rozet taşıyor.

**Doğrulama.** Ham anahtar sızıntısı yok, rozet "ONAYLANDI" gösteriyor; alt menü 375 px'te
çakışmıyor. `translateStatus`'un referans verdiği **30 durum anahtarının üçü de üç dilde tam**
(toplu kontrol). `tsc` temiz, `npm test` 438/438.

---

## Adım 2 — Ana sayfayı durum makinesine çevir

**Hedef.** Ana sayfa bugün bir özellik listesi: on blok, beş yarışan birincil eylem. Sürücünün tek
sorusu var — "şu an ne yapmam gerekiyor". Ekran o soruya tek cevap vermeli.

**Yaklaşım.** Günün fazına göre tek bir "Şimdi" kartı ve tek birincil buton:

| Faz | Kart | Birincil eylem |
|---|---|---|
| Mesai başlamadan | Bugünkü tur özeti | Mesaiyi başlat |
| Mesai açık, yola çıkılmadı | Abfahrtskontrolle bekliyor | Aracı kontrol et |
| Yolda | Sıradaki durak + ETA | Navigasyonu aç / Vardım |
| Durakta | Teslim bilgisi | Teslimi onayla |
| Son durak bitti | Araç iadesi | Devir fotoğrafları |
| Kapanış | — | Mesai bitir |

Faz seçimi saf bir fonksiyona alınır (`lib/driver-day-phase.ts`), girdisi mevcut veriler: work
session durumu, morning check-in var mı, imza bekleyen tutanak, bugünkü görev durumu. Bileşen
değil fonksiyon olduğu için birim testi yazılabilir — bu adımın asıl güvencesi orada.

Kaldırılacaklar: hızlı işlemler ızgarası (üstteki uyarıları tekrar ediyor), mesaj/bildirim
sayaçları (üç ayrı yerde görünüyor), konum paylaşımı kartı (`/driver/profile`'a taşınır — her gün
verilecek bir karar değil).

**Dokunulacak.** `app/(driver-portal)/driver/page.tsx`, yeni `lib/driver-day-phase.ts`,
`components/driver-portal/` altında yeni `DriverNowCard`. Backend işi yok.

Bu adım aynı zamanda **UX temeli** bölümünün 1-6. maddelerini taşır: ekran zaten baştan yazıldığı
için renk tokenlarına geçiş, anlamsal durum renkleri, tek birincil buton, 44 px dokunma hedefi,
hiyerarşi ve iskelet durumları burada uygulanır. Ayrı bir tur olarak yapılırsa aynı dosyalara iki
kez dokunulmuş olur.

**Doğrulama.** Faz fonksiyonu için birim testleri (her faz + sınır durumlar); yedi fazın ekran
görüntüsü 375 px'te; sürücü portalı altında ham hex kalmadığının grep ile kontrolü.

**Risk.** Düşük — mevcut veri, yeni uç yok. Asıl risk faz kurallarının iş gerçeğiyle uyuşmaması;
o yüzden adım sonunda üstünden birlikte geçilmeli.

---

## UX temeli — enine kesen

Ayrı bir adım değil: her adımın içinde uygulanır. Ama kuralları burada bir kez yazılır, yoksa her
ekranda yeniden icat edilir.

Kullanım bağlamı tasarımı belirliyor: **kabinde, aceleyle, çoğu zaman eldivenle, kötü şebekede,
bazen gece.** Aşağıdakilerin hepsi bu cümleden türüyor; "modern görünsün" diye değil.

### 1. Renk borcu — Adım 2 ⚠️ TEŞHİS DÜZELTİLDİ

İlk teşhis "tasarım sistemi var ama portal onu kullanmıyor" idi. Gerçek daha kötü çıktı:
**token katmanı hiç çalışmıyor.**

Proje Tailwind **4** kullanıyor. `app/globals.css` yalnızca `@import "tailwindcss"` ve iki
değişkenlik bir `@theme inline` bloğu içeriyor; **`@config` direktifi yok.** Tailwind 4'te
`tailwind.config.ts` ancak `@config` ile yüklenir. Yani oradaki `brand.*`, `surface.*`, `text.*`
paletinin tamamı hiç derlenmiyor.

Tarayıcıda ölçüldü:

| Sınıf | Hesaplanan |
|---|---|
| `bg-brand-primary` | `rgba(0,0,0,0)` (şeffaf) |
| `text-brand-primary` | `rgb(0,0,0)` (varsayılan) |
| `border-surface-border` | `rgb(0,0,0)` |
| `bg-slate-200` | ✅ çalışıyor |

Bu, portaldaki gömülü hex'leri açıklıyor: geliştiriciler tasarım sisteminden sapmamış, **token
hiç çalışmadığı için** hex yazmak zorunda kalmışlar.

**Kapsam uyarısı.** `brand-primary` **53 dosyada**, `bg-surface` 27 dosyada geçiyor — hepsi şu an
ölü. Tokenları açmak bu 53 dosyanın rengini aynı anda değiştirir; bu, sürücü portalını çok aşan ve
kendi doğrulama turunu hak eden ayrı bir iş. Adım 2 bu yüzden Tailwind'in yerleşik paletini
(slate/amber/emerald/blue) anlamsal rollere bağlayarak ilerledi.

**Ayrı iş olarak planlanmalı — "Token katmanını dirilt":** `globals.css`'e `@theme` ile paleti
taşı veya `@config` ekle, sonra 53 dosyayı görsel olarak gözden geçir. Gece modu (madde 8) da
buna bağlı.

**Doğrulama.** `app/(driver-portal)/driver/page.tsx` ve `DriverNowCard.tsx` altında ham hex
kalmaması — sağlandı.

### 2. Anlamsal durum renkleri — Adım 2

Bugün amber/red/emerald tonları her kartta yeniden seçiliyor. Tek kural konur ve her ekranda aynı
kalır:

| Renk | Anlamı | Örnek |
|---|---|---|
| `brand.warning` | Senin yapman gereken bir şey var | Kontrol bekliyor, imza bekliyor |
| `brand.danger` | Sorun bildir / durdurucu | Kaza, arıza |
| `brand.secondary` | Tamamlandı | Tur bitti, mesai kapandı |
| `brand.info` | Bilgi, eylem gerekmez | Ofis notu |

Sürücü rengi öğrenir ve metni okumadan ne olduğunu anlar. Bugün bunu yapamıyor.

### 3. Tek birincil buton — Adım 2

Şu an aynı ekranda kırmızı, amber ve outline butonlar eşit ağırlıkta yarışıyor. Faz makinesi
zaten "tek eylem" diyor; görsel dil de onu desteklemeli. Ekranda **bir** dolu buton olur, geri
kalan her şey ikincil (outline) veya bağlantı.

### 4. Dokunma hedefi en az 44 px — Adım 2

Eldivenle kullanılıyor. Mobil denetimde 32 px altı hedefler sayıldı. Birincil eylem tam genişlik
ve en az 48 px yüksekliğinde olmalı.

### 5. Başparmak erişimi ve hiyerarşi — Adım 2

Bugün ekranın en büyük görsel ağırlığı en üstteki karşılama kartında ("Merhaba, İlker") — yani en
az işe yarayan şeyde. "Şimdi" kartı ekranın baskın öğesi olmalı, birincil eylem başparmağın
ulaştığı alt bölgede durmalı. Karşılama tek satıra iner.

### 6. İskelet (skeleton) durumları — Adım 2

Veri gelene kadar bileşenler `null` dönüyor, ekran boş yanıp sönüyor. Kötü şebekede sürücünün
gördüğü şey bu. Kart iskeletleri konur; yükseklik baştan ayrılır ki içerik gelince ekran zıplamasın.

### 7. Çevrimdışı görünürlüğü — Adım 3a

`DriverOfflineStatusBar` ve `driver-offline-queue-core` zaten var. Eksik olan sürücünün kuyruğu
görmesi: "3 kayıt gönderilmeyi bekliyor". Bağlantısı yokken gönderdiği şeyin kaybolmadığını
bilmeli, yoksa aynı şeyi tekrar tekrar gönderir.

### 8. Gece modu — Adım 5 ile birlikte

`darkMode` hiç yapılandırılmamış, `.dark` stili yok. Sürücüler gece sürüyor; kabinde saat 03:00'te
bembeyaz ekran göz kamaştırır ve gece görüşünü bozar. Bu bir moda tercihi değil, kullanım
gereği — ve sürüş güvenliğine dokunduğu için ciddiye alınmalı.

Tokenlar (madde 1) yapılmadan gece modu yapılamaz; sıralama bu yüzden böyle. Sistem tercihine
uyar, sürücü profilden elle de seçebilir.

### 9. Service worker eski sürümü servis ediyor — ACİL, ayrı iş

Adım 2 doğrulanırken çıktı: `/driver` kapsamında kayıtlı bir service worker ve
`driver-portal-shell-v1` önbelleği kabuğu sunuyor. Dev sunucusu yeniden başlatıldı, `.next`
temizlendi, sayfa zorla yenilendi — **hiçbiri işe yaramadı**; ekranda hep eski sürüm kaldı.
Ancak `unregister()` + `caches.delete()` sonrası yeni sürüm göründü.

Bu bir test tuhaflığı değil, **üretim riski**: sürücü portalına bir düzeltme yayınlandığında
sürücüler eski sürümü görmeye devam eder. `DriverPortalUpdateBanner` muhtemelen bunun için var
ama açıkça yeterli değil — çünkü burada hiç devreye girmedi.

İncelenmesi gerekenler: service worker'ın kayıt/güncelleme stratejisi, cache adının sürümlenmesi
(`-v1` elle mi artıyor?), `skipWaiting`/`clients.claim` kullanımı ve güncelleme banner'ının
gerçekten tetiklenip tetiklenmediği.

Sürücü tarafında yapılacak her düzeltmenin sahaya ulaşması buna bağlı olduğu için, sıradaki
adımlardan önce ele alınmalı.

### Kapsam dışı

Yeni tasarım dili, yeni bileşen kütüphanesi, animasyon katmanı. Mevcut shadcn/Radix ve
`tailwind.config.ts` tokenları yeterli; sorun eksiklik değil, tutarsız kullanım.

---

## Adım 3 — `/driver/tour` (en yüksek değer)

**Hedef.** Sürücünün asıl işi turdur ve web portalında hiç yok. `PROJECT_STATUS.md` bunu B3 olarak
zaten kaydetmiş: mobilde var, webde yok.

**⚠️ Düzeltme (2026-08-07).** Bu adım ilk yazıldığında "uç hazır, sadece arayüz" diye
geçiyordu. Yanlıştı. `tour-driver.controller.ts` yalnızca `GET today` sunuyor; mobil de sadece
onu çağırıyor. Yani **tur bugün her yerde salt okunur** — ne webde ne mobilde durak durumu
güncellenebiliyor.

Bu adım ikiye ayrılmalı:

- **3a — Turu göster (yalnızca arayüz).** `driver/tours/today` ile durak listesi, sıra, adres,
  zaman penceresi, harita uygulamasına derin bağlantı. Mobildeki veri sözleşmesi birebir alınır.
  `lib/navigation-links.ts` mobilde derin bağlantıları çözüyor; ortak yardımcıya çıkarılıp web'de
  de kullanılabilir (mobil dosyaya dokunmadan).
- **3b — Durak durumu güncelleme (backend + arayüz).** "Vardım / teslim ettim" için yeni uç
  gerekiyor: durak durumu, zaman damgası, opsiyonel imza/foto. Tur katmanının sahibi
  `RoutingModule`; yeni Prisma alanı gerekirse CLAUDE.md 2. kural geçerli (migration +
  tenant-scoped-models + tenant-isolation-check aynı commit içinde).

**Doğrulama.** 3a: sürücü hesabıyla tur açılıyor, duraklar doğru sırada, 375 px ekran görüntüsü.
3b: durum güncellemesi backend'e yazılıyor ve ofis tarafında görünüyor.

**Risk.** 3a düşük. 3b orta-yüksek — yeni uç, yeni durum geçişleri, mobil ile web'in aynı
sözleşmeyi paylaşması gerekiyor.

---

## Adım 4 — `/driver/departure-check` (Abfahrtskontrolle)

**Hedef.** Günlük araç kontrolü yasal zorunluluk ve sürücü bunu web'den yapamıyor.

**Önemli ayrım.** Bugünkü `/driver/morning-checkin` araç plakası + firma + yük soruyor; bu bir
*tur başlangıç beyanı*, güvenlik kontrolü değil. İkisi ayrı kalmalı: check-in tur başlatmanın
içine erir (Adım 2), Abfahrtskontrolle kendi sayfası olur.

**Yaklaşım.** `driver/departure-check` ucunun alanlarına göre form; kusur bulunursa doğrudan arıza
bildirimine bağlanır (Adım 6). Adım 2'deki faz makinesinde "yola çıkmadan önce" kapısı olarak
konumlanır.

**Doğrulama.** Kontrol kaydı backend'e yazılıyor, ofis tarafındaki `/departure-checks` listesinde
görünüyor.

**Risk.** Düşük-orta — uç hazır, alan eşlemesi netleştirilmeli.

---

## Adım 5 — Kalan sürüş süresi

**Hedef.** 561/2006 ihlalinde cezayı yiyen ve ehliyetini riske atan kişi sürücü, ama kalan sürüş
ve mola süresini yalnızca ofis görüyor (`tachograph/remaining-driving-time`).

**Yaklaşım.** Ana sayfada kalıcı bir şerit: kalan sürüş süresi, bir sonraki zorunlu molaya kalan
süre, günlük/haftalık durum. Rakiplerde düzgün yapılmayan bir şey; veri zaten mevcut.

**Doğrulama.** Takograf kural motorunun mevcut 33 testiyle tutarlılık; sürücü hesabıyla ekran
kontrolü.

**Risk.** Orta — sürücüye gösterilen sayı yanlışsa güven kaybı büyük olur. Ofis ekranıyla birebir
aynı kaynaktan beslenmeli, arayüzde yeniden hesap yapılmamalı.

---

## Adım 6 — Arıza bildirimi + yakıt girişi

**Hedef.** Sahada gereken iki eksik giriş.

**Yaklaşım.**
- Arıza: `DriverReportsForm` bugün kaza + yük hasarını taşıyor; üçüncü tip olarak araç arızası
  (`driver/defects`) eklenir. Yeni sayfa değil, mevcut formun genişletilmesi.
- Yakıt: yeni `/driver/fuel`, `driver/fleet/fuel-entries` ucuna bağlanır.

**Doğrulama.** Kayıtlar ofis tarafındaki `/defects` ve yakıt ekranlarında görünüyor.

**Risk.** Düşük.

---

## Sonraki tur (bu planın dışında)

`driver/license-check`, `driver/fines`, `driver/fleet/trips`, sürüş skoru — hepsinin ucu hazır,
arayüzü yok. Adım 6 bitince tek tek ele alınabilir.

## Bu planın kapsamadıkları

- Mobil uygulama (`mobile-driver/`) — dokunulmuyor
- Ofis/dashboard tarafı — yalnızca sürücü verisinin göründüğü yerler doğrulama amaçlı okunur
- `MOBIL-DENETIM.md`'deki 3, 4, 5, 6 numaralı bulgular (pazarlama sayfası taşmaları, araç fotoğrafı
  404'leri, yanlış rolde boş portal ekranı, sabit İngilizce metinler) — ayrı iş
