# Rota Optimizasyonu — Fizibilite Raporu ve Uygulama Planı

**Tarih:** 2026-07-31
**Durum:** Faz 1 başladı (adım 1 tamamlandı)
**Amaç:** Lojistik müşterilerinin girdiği adreslere göre rota optimizasyonu; hedef, fazladan
yakıt harcamasını ölçmek ve azaltmak.

---

## 1. Mimari kararlar

| Karar | Seçim | Gerekçe |
|---|---|---|
| İş tipi | Karışık (FTL + çok duraklı) | `Tour` modeli tek duraklı görevi iki duraklı özel durum olarak kapsar |
| Rota/mesafe motoru | **Self-hosted Valhalla** | Ücretsiz, sınırsız çağrı, kamyon profili, veri kendi altyapımızda (GDPR) |
| VRP çözücü | **OR-Tools** (Faz 2) | Valhalla'nın yerleşik `/optimized_route`'u sadece TSP — kapasite/zaman penceresi/çoklu araç yok |
| ML rolü | Girdi tahmini, optimizasyon değil | Sektör standardı: VRP kombinatoryal optimizasyonla çözülür, ML seyahat süresi / servis süresi / yakıt tüketimini tahmin eder |

### Neden ML optimizer değil
Rakiplerin hiçbiri rota optimizasyonunu ML ile *çözmüyor*. XGBoost/LightGBM'in yeri şurası:

1. **Seyahat süresi düzeltmesi** — Valhalla süresi baseline, model `gerçek − tahmin` artığını öğrenir
2. **Durakta bekleme (dwell) süresi** — müşteri, yük tipi, saat
3. **Yakıt tüketimi (L/100km)** — yük, rakım profili, hız profili, sürüş olayları, şoför skoru, hava
4. **Sapma tespiti** — planlanan vs gerçekleşen km/litre

Feature kaynakları repoda hazır: `FleetTrip`, `FleetTripLocationPoint`, `FleetDrivingEvent`,
`FleetFuelEntry`, `FuelCardTransaction`, `Vehicle.avgConsumptionLPer100Km`,
`fleet-driver-score.service.ts`.

**Sıralama önemli:** Faz 3 (ML) ancak Faz 1'deki geocoding + planlanan/gerçekleşen eşleştirmesi
kurulduktan sonra etiketli veri üretmeye başlar. Önce sabit katsayılı formül yeterli.

---

## 2. Valhalla kalite testi — ölçülen sonuçlar

Test ortamı: NRW extract (867 MB), Docker VM 5,8 GB RAM / 8 CPU, 4 build thread.
Test paketi ve ham sonuçlar bu commit'te taşınmadı (geçici); yöntem aşağıda özetlendi.

### 2.1 Kurulum maliyeti (ölçüldü)

| | NRW | Tüm Almanya (ekstrapolasyon) |
|---|---|---|
| Build süresi | **65 dk** | ~4-5 saat |
| valhalla_tiles.tar | 812 MB | ~4,3 GB |
| elevation_data | 322 MB | ~3,4 GB (alan bazlı) |
| timezone + admin | 136 MB | 136 MB (sabit) |
| **Toplam** | **~1,2 GB** | **~8-10 GB** |

Tile'lar hazır olduğunda servis **2 saniyede** açılıyor (`use_tiles_ignore_pbf`).

### 2.2 Bulgular

**✅ Araç boyut kısıtları gerçekten uygulanıyor.**
29 OD çifti üzerinde tarandı (tek rota yanıltıcı olabiliyor — kısıtsız otoyol rotasında hiçbir
varyant fark yaratmaz):

| Parametre | Sonuç |
|---|---|
| yükseklik 4,9 m | 7/29 rotada fark, max 23,8 km sapma |
| ağırlık 60 t | 4/29 rotada fark, max 19,3 km |
| ADR (hazmat) | 4/29 rotada fark, max 6,0 km |
| uzunluk 25 m | fark yok — OSM'de `maxlength` etiketi pratikte yok |

**⚠️ Kamyon costing'i kalibrasyon istiyor.**
Duisburg Hafen → Köln:
- `auto`: A40 → A59 → A524 → A3 → A4 = 85,7 km
- `truck`: A40 → A57 → **B51** = 76,2 km (aynı süre)

Valhalla 40 t aracı Bundesstraße'ye sokuyor. Gerçekte yanlış tercih: B51 tek şeritli, şehir içi,
dur-kalk yakıt yakıyor — ve **Maut 2018'den beri Bundesstraße'lerde de geçerli**, yani toll
tasarrufu da yok. `use_highways` / `use_tolls` ağırlıkları kalibre edilmeli. Kutudan çıktığı gibi
kullanılamaz.

**🔴 Tek bir kamyona-kapalı durak tüm optimizasyonu çökertiyor.**
Bielefeld merkez koordinatı (52.0302, 8.5325) 4,4 m mesafede kamyona kapalı bir yola snap oluyor.
`auto` ile aynı hedef sorunsuz (172,7 km), `truck` ile `400 No path could be found`. Koordinat
100-200 m kaydırılınca çalışıyor. 20 duraklı optimizasyon bu tek nokta yüzünden komple patlıyor;
hangi durağın suçlu olduğu yanıttan anlaşılmıyor.

→ **Faz 1 gereksinimi:** her adres kaydedilirken kamyon erişilebilirliği doğrulanmalı. Geçemezse
*o adres için* kullanıcıya uyarı verilir.

**Ucuz kontrol işe yaramıyor — ölçüldü.** İlk tasarımda `/locate` verbose çıktısındaki erişim
bayrağına bakılacaktı. Ölçüm bunu çürüttü: hem Bielefeld'in kamyona kapalı koordinatı hem de
sağlam bir liman koordinatı `access.truck: true` döndürüyor. Sorun kenarın erişim bayrağı değil,
kenarın kamyon ağından **kopuk** olması. Tek güvenilir kontrol referans bir noktadan gerçek rota
denemesi (`ROUTING_ACCESS_PROBE_LAT/LON`, varsayılan Duisburg Hafen). Maliyeti kabul edilebilir:
`Location` başına bir kez çalışır, sonuç kayda yazılır, adresler defalarca yeniden kullanılır.

`/locate`'in verdiği tek değerli bilgi **snap mesafesi** — koordinatın en yakın kamyon yoluna
uzaklığı. Büyük değer geocode kalitesinin düşük olduğunu gösterir. Bunun için `verbose: true`
gerekiyor; verbose olmadan kenar nesnesi `distance` taşımıyor.

**✅ Rakım verisi yakıt modeli için ayırt edici.**
- Köln → Siegen (Sauerland): 101 km, 2.048 m tırmanış → **20,2 m/km**
- Duisburg → Oberhausen (düz Ruhr): 23 km, 359 m → **15,5 m/km**

**⚠️ Matris performansı: arka plan job'u şart.**

| Matris | Soğuk | Sıcak |
|---|---|---|
| 10×10 | 768 ms | 338 / 388 ms |
| 20×20 | 5.904 ms | 800 / 639 ms |
| 41×41 (1 depo + 40 durak) | 7.093 ms | — |

Sıcak cache 7-9× hızlandırıyor → **Redis cache zorunlu**. 40 duraklı senaryo 7 sn: kullanıcı
butona basıp bekleyemez, **BullMQ job** olmalı.

**⚠️ Yerleşik `/optimized_route` yetersiz.**
Çalışıyor (8-19 durak, 2-6 sn) ama sadece TSP: kapasite yok, zaman penceresi yok, çoklu araç yok,
sürüş süresi kısıtı yok. OR-Tools kararı doğrulandı.

**🟡 Maut tutarı ve Sonntagsfahrverbot yok — bu bizim farklılaşma alanımız.**
- `trip.summary` alanları: `has_toll` (boolean), `cost` (Valhalla iç birimi). **€ cinsinden Maut yok.**
- Pazar 10:00 ve Salı 10:00 rotaları tıpatıp aynı → Sonntagsfahrverbot uygulanmıyor.
- `has_time_restrictions` alanı mevcut, yani OSM'de etiketli koşullu kısıtlar destekleniyor —
  ama Almanya'nın genel Pazar yasağı yol yol etiketlenmiş değil.

Genel amaçlı optimizerlerin yapamadığı, bizde **verisi zaten duran** üç şey:
1. **AB 561/2006 sürüş/dinlenme süresi** — `TachoActivity` verisi mevcut. "Bu şoförün 3 sa 20 dk
   sürüş hakkı kaldı, plan buna göre" diyebilmek pazarda nadir.
2. **LKW-Maut** — 07/2024'ten beri 3,5 t üstü tüm araçlarda, CO2 sınıfı bileşeniyle. Uzun yolda
   çoğu zaman yakıttan büyük kalem. Hedef: **toplam maliyet = yakıt + toll + şoför saati**.
3. **Alman sürüş yasakları** — Sonntagsfahrverbot, Ferienreiseverordnung, Umweltzonen.

### 2.3 Gerçekçi kazanç beklentisi
- Çok duraklı dağıtım: km tasarrufu **%5-15**
- Tek yük uzun yol (FTL): rota optimizasyonundan **%2-5**; asıl kazanç toll rotası, şoför
  davranışı ve boş dönüş (Leerfahrt) azaltmada

---

## 3. Mevcut kod tabanı — boşluk analizi

**Var:**
- `FleetTripLocationPoint` (lat/lng breadcrumb), `DriverLocationLatest/History`
- `FleetFuelEntry`, `FuelCardTransaction`, `Vehicle.avgConsumptionLPer100Km`
- `TachoActivity`, `TachoInfringement`
- Leaflet haritalar, `frontend/app/api/route-map/route.ts` (public Nominatim + OSRM demo)

**Yok:**
- `Assignment.pickupAddress` / `deliveryAddress` düz **String** — koordinat yok, geocode cache yok
- Çok duraklı **tur kavramı yok** (bir görev = tek pickup → tek delivery)
- Kapasite, zaman penceresi, araç kısıt alanları yok
- Public OSRM demo sunucusu kullanılıyor: **otomobil profili** + ToS ihlali, prod'a çıkamaz

---

## 4. Faz planı

### Faz 1 — Geo temeli
1. ✅ **Valhalla servisi** `docker-compose.yml`'e eklendi (`valhalla_data` volume, env ile bölge seçimi)
2. ✅ **`Location` modeli** + migration + `tenant-scoped-models.ts` + `tenant-isolation-check.ts` (CLAUDE.md kural 2). `Assignment`'a nullable `pickupLocationId`/`deliveryLocationId` de bu adımda eklendi.
3. ✅ **`RoutingModule`**: `ValhallaClient` (route / matrix / locate / height), `GeocodingService` (Photon), `RoutingCacheService` (Redis, yoksa süreç içi Map), `RoutingService` (adres→Location çözümleme, önbellekli rota ve matris). Hiçbir metot istisna fırlatmıyor — Valhalla veya geocoder erişilemezse görev kaydetme akışı durmuyor, alanlar boş kalıp sonradan yeniden denenebiliyor.
4. ✅ **`Assignment` entegrasyonu.** Görev oluşturma/güncelleme commit sonrası `Location` üretiyor (`linkAssignmentLocationsSafely`, `driver-notify`'daki fire-and-forget deseni — geocoding transaction içine girmemeli, kilit tutar). Adres değişince eski bağ koparılıp yeniden çözümleniyor. `scripts/backfill-assignment-locations.ts` (`npm run backfill:assignment-locations`): idempotent, tenant başına, `--limit/--tenant/--delay/--skip-access-check/--dry-run`.
5. ⬜ Planlanan vs gerçekleşen sapma raporu + de/en/tr i18n

### Backfill ölçümleri ve adım 4'te çıkan üç hata

**Dedupe beklenenden çok daha değerli:** 1029 görevde yalnızca **31 benzersiz adres**. Tasarım
2058 geocode çağrısını 31'e indiriyor (%98,5 azalma). Backfill'in hız sınırlaması buna göre
düzeltildi — bekleme her göreve değil, yalnızca gerçekten geocoder'a gidildiğinde uygulanıyor.

**(a) Kapsam dışı adresler yanlışlıkla "kamyona kapalı" işaretleniyordu.** Demo veride Hamburg/
Berlin adresleri var, tile kapsamı NRW. Valhalla ikisini `error_code` ile ayırıyor — **171**
"No suitable edges near location" (kapsam dışı) vs **442** "No path could be found" (gerçekten
erişilemez). İlk kod mesaj metnine bakıp ikisini karıştırıyordu. Artık `error_code` kullanılıyor
ve kapsam dışı adresler `unreachable` değil `check_failed` olarak işaretleniyor. Kapsam dışı
noktada `/locate` 200 ama boş kenar listesi döndürüyor — o da `out_of_coverage` sayılıyor.

**(b) Check-then-insert yarışı.** Bir görevin alış ve teslim adresi paralel çözümleniyor; ikisi
aynıysa her ikisi de "yoksa oluştur" diyerek `@@unique([tenantId, normalizedHash])` kısıtını
ihlal ediyordu (1021 görevin 1'inde gözlendi). Unique ihlali (P2002) yakalanıp mevcut kayıt
okunuyor. Not: `instanceof PrismaClientKnownRequestError` yerine `code` kontrolü kullanıldı —
ts-node/tsx altında birden fazla `@prisma/client` örneği yüklenebiliyor ve `instanceof`
yanıltıyor.

**(c) Tesis adıyla başlayan adresler geocode edilemiyordu.** "DHL Hub Hamburg-Billbrook,
Halskestraße 48" gibi biçimler Photon'da boş dönüyor; virgül öncesi atılınca çözülüyor.
Ama ham fallback tehlikeli: "DB Schenker Terminal **Dresden**, Hamburger Straße 19" ön eksiz
sorguda **Bremen**'deki bir Hamburger Straße'yi döndürüyor. Sessizce yanlış şehre geocode etmek
hiç etmemekten kötü — sapma raporu yüzlerce km hayali fark üretir. Bu yüzden fallback sonucu
yalnızca dönen şehir orijinal metinde geçiyorsa kabul ediliyor
(`core/geocode-consistency.util.ts`, 7 birim testi) ve kabul edilse bile güven 0,7'ye çekiliyor.
Sonuç: başarısız geocode 4 → 1; kalan tek kayıt bilerek reddedilen Dresden vakası.

**Adım 5'ten önce yapılması gereken:** kamyon costing kalibrasyonu (bulgu 2.2). Sapma raporu
"planlanan km"yi Valhalla'dan alacağı için kalibre edilmemiş rota yanlış bir taban üretir.

**Faz 1'in müşteriye görünen çıktısı:** "geçen ay 47 görevde fazladan 1.240 km, ~380 L, ~€760".
Henüz optimizasyon yok — ama satışta Faz 2'yi finanse eden cümle bu.

Geocoder olarak **Photon** (Komoot, Almanya extract ~3 GB) önerilir; Nominatim self-host çok ağır,
public Nominatim prod'da kullanılamaz.

### Faz 2 — Tur + optimizer
- `Tour` / `TourStop` modelleri (sıra, zaman penceresi, servis süresi, ağırlık/hacim)
- OR-Tools mikroservisi, BullMQ job olarak
- Kısıtlar: kapasite, zaman penceresi, **takografdan kalan sürüş süresi**, araç kategorisi
- Einsatzplan'da "Tour optimieren" + öncesi/sonrası karşılaştırma (km, süre, yakıt, toll)

### Faz 3 — ML katmanı
- Yeterli `FleetTrip` verisi biriktikten sonra XGBoost: süre + yakıt tahmini
- Optimizer maliyet fonksiyonu sabit L/100km yerine tahmini tüketim kullanır
- SHAP ile açıklanabilirlik (B2B satışta "neden bu tahmin" sorusu geliyor)

---

## 5. Operasyon notları

```bash
docker compose up -d valhalla        # ilk açılış tile build eder, sonrası saniyeler
curl localhost:8002/status
```

- Bölge değiştirme: `VALHALLA_REGION_URL` + `VALHALLA_FORCE_REBUILD=True`, build bitince tekrar `False`
- `backend` servisi Valhalla'ya **hard dependency değil** — ilk build saatler sürdüğü için backend
  açılışını bloklamamalı. `RoutingModule` Valhalla erişilemezse zarifçe bozulmalı.
- Prod: Almanya build'i ayrı bir sunucuda alınmalı (~5 sa, ~10 GB, 16 GB RAM önerilir)
- `traffic.tar` uyarıları normal — trafik verisi kullanmıyoruz
- Bölgesel extract'te `admin_access` NOT NULL hataları normal (Valhalla'nın kendi mesajı:
  "Ignore if not using a planet extract")
