# Günlük İş Akışı Denetimi

**Tarih:** 2026-08-01 · **Yöntem:** Gerçek tarayıcıda, gerçek oturumla, onaylanmış günlük
akışların adım adım yürütülmesi. Kod okuması değil — her satır ekranda görülerek doğrulandı.
**Kural:** Denetim sırasında hiçbir veri veya kod değiştirilmedi.

Roller: `office@fleet.com` (Disponent), `accounting@fleet.com` (Buchhaltung),
`driver@fleet.com` (Fahrer, web portalı).

---

## Özet

| | |
|---|---|
| Yürünen sayfa | 13 |
| Çöken / hata veren sayfa | **0** |
| Ham çeviri anahtarı görünen sayfa | **0** |
| Pilot engeli sayılacak bulgu | **2** |
| İyileştirme fırsatı | 3 |

**Genel değerlendirme:** Günlük akışların hiçbirinde çökme, hata ekranı veya eksik çeviri
yok. Sayfalar gerçek veriyle dolu ve iş yapılabilir durumda. Bulunan iki ciddi sorun
"bozuk sayfa" değil, **erişilebilirlik** sorunu: çalışan modüllere menüden ulaşılamıyor.

---

## 1. Office / Disponent — sabah akışı

| Adım | Sayfa | Sonuç |
|---|---|---|
| Genel durum | `/dashboard` | ✅ yükleniyor, hatasız |
| Günlük özet | `/assignments` | ✅ (eski `daily-overview` linki buraya yönleniyor — doğru) |
| Sabah check-in'leri | `/assignments?view=morning-checkins` | ✅ 6 KPI sayacı + tablo; bugün 0 kayıt (veri yok, hata yok) |
| Çıkış kontrolleri | `/departure-checks` | ✅ dolu — bugünün kontrolleri şoför/plaka/saat ile listeleniyor |
| Arızalar | `/defects` | ✅ önem derecesine göre gruplu liste, gerçek kayıtlar |
| Kalan sürüş süresi | `/tachograph/remaining-driving-time` | ✅ sürücü bazlı kalan süre, haftalık/iki haftalık toplam |
| Canlı takip | `/live-tracking` | ✅ harita + 6 işaretçi, "Telematik (1)" |
| İzin/hastalık talepleri | `/requests` | ✅ durum sayaçları + boş durum mesajı doğru |

**Not:** Canlı takipteki telematik aracı, bugün düzeltilen konum yazma hatasının kanıtı.
Düzeltme öncesi orada 0 araç görünecekti.

## 2. Office — gün içi ve akşam

| Adım | Sayfa | Sonuç |
|---|---|---|
| Yeni görev | `/assignments/new` | ✅ 27 alan, adres otomatik tamamlama (4 combobox), rota haritası yerinde |
| Tur planlama | `/assignments` → Touren | ✅ sekme mevcut ve çalışıyor |
| Bekleyen işler | `/office/queue` | ✅ 73 iş, aciliyete göre sıralı, kategorilere ayrılmış |

`/office/queue` günlük çalışma için en güçlü ekran: uyarılar (37), transport (18),
devir (8), talepler (8), belgeler (1), e-postalar (1).

## 3. Muhasebe

| Adım | Sayfa | Sonuç |
|---|---|---|
| Faturalama | `/invoicing` | ✅ sayfa çalışıyor — 548.006 € faturalanmamış, 10.210 € açık alacak |
| Menüden erişim | kenar menüsü | 🔴 **ERİŞİLEMİYOR** (aşağıda) |
| Yakıt kartı mutabakatı | `/fleet-analytics/fuel-card` | 🔴 **hiçbir menüde yok** |

## 4. Sürücü — web portalı

| Adım | Sonuç |
|---|---|
| Giriş | ✅ |
| `/driver` | ⚠️ açık vardiya onayına yönlendiriyor (12 saatten uzun kalmış vardiya) |
| Navigasyon | 5 madde: ana sayfa, mesajlar, talepler, raporlar, profil |
| Tur ekranı | 🔶 **yok** — mobilde var, webde yok |

Vardiya onay ekranı **doğru bir ürün davranışı**: sürücüyü hatalı bordro kaydı bırakmadan
devam ettirmiyor. Ama denetim sırasında onaylanmadı (veri değiştirmeme kuralı), bu yüzden
sürücü ana ekranının kendisi görülmedi.

---

## Bulgular

### 🔴 B1 — Muhasebeci faturalama modülüne menüden ulaşamıyor

**Etki:** Muhasebecinin en önemli günlük aracı. Menüde hiç görünmüyor; kullanıcı URL'yi
bilmeli ya da dashboard'daki bir karta tıklamalı.

**Kök neden:** İki bağımsız yetki listesi birbiriyle çelişiyor.
- `lib/navigation.ts` → `getNavigationForRole` faturalamayı admin/boss/accounting rollerine
  ekliyor ("Verwaltung" grubuna).
- `components/layout/Sidebar.tsx` → `NAV_ITEMS` listesinde `/invoicing` **hiç yok**.
- Sidebar ikisinin **kesişimini** aldığı için (`allowedHrefs` filtresi) madde eleniyor.

**Doğrulama:** Muhasebe oturumunda "Verwaltung" grubu açıldığında görünenler:
Erinnerungen, Bußgeldverwaltung, Arbeitszeiten, Fahrzeugkosten, Anfragen — Rechnungen yok.

**Kapsam:** İki liste karşılaştırıldığında bu sınıftan **tek kurban** var (`/invoicing`).
Diğer 45 madde iki listede de mevcut.

### 🔴 B2 — Yakıt kartı mutabakatı sayfası hiçbir menüde yok

283 satırlık, gerçek API'ye bağlı bir muhasebe sayfası (`/fleet-analytics/fuel-card`).
Kenar menüsünde, hesap menüsünde ve iç bağlantılarda yok. Yazılmış ama bağlanmamış.

### 🔶 B3 — Sürücü web portalında tur ekranı yok

Tur listesi ve navigasyon başlatma mobil uygulamada var, web portalında yok. Sürücülerin
webten de gireceği kararı verildiğine göre bu bir parite boşluğu.

### 🔶 B4 — "Verwaltung" grubu varsayılan kapalı

Muhasebecinin günlük işlerinin çoğu (cezalar, çalışma saatleri, maliyetler) bu grubun
içinde ve grup varsayılan olarak kapalı geliyor. Giriş yapan muhasebeci kendi araçlarını
göremiyor. Rol bazlı varsayılan açıklık düşünülmeli.

### 🔶 B5 — Sürücü ana ekranı vardiya onayıyla kapalı kalabiliyor

Doğru davranış ama tek çıkış yolu onay vermek. Pilotta sürücü bu ekranda takılırsa
destek çağrısı gelir; "daha sonra" seçeneği veya ofisten çözebilme yolu değerlendirilmeli.

---

## Bu denetimin kapsamadıkları

- **Mobil uygulama** — bu makinede çalıştırılamıyor (Xcode/Android SDK yok, Expo web
  `expo-sqlite` yüzünden açılmıyor)
- **Yazma akışları** — görev oluşturma, fatura kesme, onaylama gibi veri değiştiren adımlar
  denenmedi (denetim kuralı gereği)
- **ERP/muhasebe doğruluğu** — faturanın XRechnung formatına uyduğu teknik olarak
  doğrulanabilir, vergi açısından doğruluğu bir Steuerberater işi
- **Yük altında davranış** — tek kullanıcı, boş sistem koşullarında test edildi
