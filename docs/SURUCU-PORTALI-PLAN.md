# Sürücü Portalı — Çalışma Planı

**Başlangıç:** 2026-08-07 · **Kapsam:** web sürücü portalı (`app/(driver-portal)`) · **Mobil dokunulmuyor**

Çıkış noktası: sürücü tarafı bir özellik eksiği değil, **arayüz eksiği**. Backend'de sürücüye özel
sekiz uç hazır ve web portalı bunların çoğunu hiç çağırmıyor.

| Backend'de hazır | Web portalında | Plan adımı |
|---|---|---|
| `driver/tours` | ❌ | 3 |
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

**Doğrulama.** Faz fonksiyonu için birim testleri (her faz + sınır durumlar); altı fazın ekran
görüntüsü 375 px'te.

**Risk.** Düşük — mevcut veri, yeni uç yok. Asıl risk faz kurallarının iş gerçeğiyle uyuşmaması;
o yüzden adım sonunda üstünden birlikte geçilmeli.

---

## Adım 3 — `/driver/tour` (en yüksek değer)

**Hedef.** Sürücünün asıl işi turdur ve web portalında hiç yok. `PROJECT_STATUS.md` bunu B3 olarak
zaten kaydetmiş: mobilde var, webde yok.

**Yaklaşım.** `driver/tours` ucu hazır ve mobil onu kullanıyor. Mobildeki ekranın veri sözleşmesi
birebir alınır, arayüz web için yeniden yazılır: durak listesi, sıra, adres, zaman penceresi,
her durakta "vardım / teslim ettim", harita uygulamasına derin bağlantı.

`lib/navigation-links.ts` mobilde harita derin bağlantılarını çözüyor; aynı mantık web'e
taşınabilir (mobil dosyaya dokunmadan, ortak yardımcıya çıkararak).

**Doğrulama.** Sürücü hesabıyla gerçek turda uçtan uca: tur açılıyor, duraklar doğru sırada,
durum güncellemesi backend'e yazılıyor. 375 px ekran görüntüsü.

**Risk.** Orta — en büyük adım. Mobil ile web arasında davranış farkı çıkarsa mobil referans alınır.

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
