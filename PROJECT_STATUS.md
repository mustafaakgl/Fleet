# Fleet / Operion — Proje Durumu

**Son güncelleme:** 2026-08-03 · **Dal:** `main` · **Son commit:** `abbd2c3` · Çalışma ağacı temiz

Çok kiracılı Alman filo yönetimi SaaS. Backend NestJS 11 + Prisma 6 + PostgreSQL 16 +
BullMQ/Redis · Frontend Next.js 15 · Mobil Expo · i18n de/en/tr (mobil 13 dil).

---

## 1. Tamamlanan işler

### Rota optimizasyonu — Faz 1 (tamamlandı)

| Adım | İçerik |
|---|---|
| Valhalla rota motoru | `docker-compose.yml`'e kalıcı servis, kamyon profili, rakım verisi |
| `Location` modeli | Yapılandırılmış adres + koordinat + tenant içi geocode cache + kamyon erişim durumu |
| `RoutingModule` | Valhalla client, Photon geocoding, Redis cache, adres→Location çözümleme |
| `Assignment` entegrasyonu | Commit sonrası Location üretimi + 1029 görev için backfill |

### Adres otomatik tamamlama (tamamlandı)
Görev formunda şehir → sokak sırasıyla öneri listesi, seçimde koordinat doğrudan kaydediliyor
(sunucu tahmin yapmıyor), kamyon erişim rozeti, iki uç seçilince harita üzerinde rota önizlemesi.

### Rota optimizasyonu — Faz 2 (kısmen)
- `Tour` / `TourStop` modelleri
- `TourService`: görevlerden tur kurma + durak sırası optimizasyonu
- Ofis uçları: tur kur, optimize et, onayla, listele
- Einsatzplan'da **Touren** sekmesi — çoklu seçim → tur → optimize → önce/sonra → sürücüye aç
- **Ölçülen sonuç: 742,3 km → 148,7 km**

### Sürücü tarafı
- Mobil uygulamada tur ekranı + harita uygulamasına navigasyon bağlantısı
- `GET /driver/tours/today` ucu (taslak turlar gösterilmiyor)

### Sapma raporu
Planlanan (Valhalla) vs gerçekleşen (GPS) mesafe, araç-gün düzeyinde, litre ve euro karşılığıyla.
**Kod hazır, veri besleyemiyor** — sebepleri bölüm 5'te.

### Denetim ve dokümantasyon
- `docs/SAYFA-HARITASI.md` — 82 dashboard sayfası, erişim yollarıyla
- `docs/GUNLUK-AKIS-DENETIMI.md` — office/muhasebe/sürücü günlük akışları tarayıcıda yürütüldü
- `docs/PILOT-LAUNCH-CHECKLIST.md` — Fleet'e özel lansman listesi (35 doğrulandı, 8 başarısız)
- `docs/route-optimization-plan.md` — fizibilite raporu ve faz planı

---

## 2. Alınan mimari kararlar

**Rota motoru: self-hosted Valhalla.** Ücretsiz, sınırsız çağrı, kamyon profili, veri kendi
altyapımızda (GDPR). Ölçüldü: NRW build 65 dk / 1,2 GB; tüm Almanya ~5 saat / ~10 GB.

**Geocoding: Photon.** Geliştirmede public API, **üretimde self-host zorunlu** (adil kullanım +
gecikme + müşteri adresi üçüncü tarafa gitmemeli). Almanya indeksi 9,2 GB sıkıştırılmış,
~25 GB açılmış — bu makinede denendi, sığmadı.

**ML rota hesaplamaz.** XGBoost/LightGBM sıralama problemini çözmez; sıralama kombinatoryal
optimizasyondur. ML'in yeri çözücünün **girdilerini** tahmin etmektir: seyahat süresi, durak
bekleme süresi, yakıt tüketimi. Gerçek kısıtlar için OR-Tools gerekli.

**Şimdilik Valhalla `/optimized_route`.** Saf sıralama yapıyor (8-19 durak, 2-6 sn). Kapasite,
zaman penceresi, çoklu araç ve sürüş süresi kısıtı yok — OR-Tools gerektiğinde devreye girecek,
çağıran arayüz değişmeyecek.

**`Tour` katmanı, `Assignment`'ın yerine değil üstüne.** Tek alış+teslim görevi iki duraklık
özel durum olarak kapsanıyor.

**Optimizasyon iki adımlı.** Hesapla + önce/sonra göster → dispatcher onaylayınca sürücüye
açılır. Otomatik uygulama güven kaybettirir.

**Alış-teslim koruması.** Valhalla yalnızca gezgin satıcı problemini çözer; aynı görevin alışının
teslimden önce gelmesini bilmez. İhlal eden çıktı **uygulanmıyor**, mevcut sıra korunuyor.

**Kamyon erişimi rota denemesiyle doğrulanıyor.** `/locate` erişim bayrağı yetersiz — hem kapalı
hem sağlam koordinat `access.truck: true` döndürüyor. Sorun kenarın bayrağı değil, ağdan kopuk
olması. Location başına bir kez çalışır, sonuç kayda yazılır.

**Sunucu kod döndürür, metin değil.** Optimizasyon sebepleri `reasonCode` olarak dönüyor, çeviri
arayüzde yapılıyor. (Serbest metin, Almanca ekranda Türkçe uyarı çıkarmıştı.)

---

## 3. Değiştirilen dosyalar

**Backend**
```
src/routing/                       valhalla.client, geocoding.service, routing-cache.service,
                                   routing.service, tour.service, route-deviation.service,
                                   routing.controller, tour.controller, tour-driver.controller,
                                   core/ (address-normalize, geocode-consistency, tour-sequence,
                                   route-deviation, routing.types) + spec'ler
src/queue/telemetry-ingest.service.ts    konum sessiz düşme düzeltmesi
src/assignments/                   assignments.service, create-assignment.dto, module
prisma/schema.prisma               Location, Tour, TourStop + 4 enum
prisma/migrations/                 20260731130000_location_geo_base
                                   20260801180000_tour_planning
src/tenant/tenant-scoped-models.ts Location, Tour, TourStop kaydı
scripts/backfill-assignment-locations.ts
scripts/tenant-isolation-check.ts
```

**Frontend**
```
components/shared/                 AddressSuggestInput, AddressPickerFields,
                                   AssignmentRoutePreviewMap
components/einsatzplan/            TourPlanningPanel, EinsatzplanOfficeView
lib/                               api.ts (routingApi, toursApi), decode-polyline,
                                   address-format (hata düzeltmesi), office-deep-links, types
app/(dashboard)/assignments/new/   adres alanları + harita
src/locales/{de,en,tr}/            common.json, einsatzplan.json
```

**Mobil**
```
app/(app)/today/tour.tsx           tur ekranı
app/(app)/today/_layout.tsx, index.tsx
src/lib/navigation-links.ts        harita uygulaması derin bağlantıları
src/lib/maps.ts, src/api/          endpoints, types
src/locales/ (13 dil)              tour bloğu
```

**Kök / docs**
```
docker-compose.yml                 valhalla servisi
.env.example                       12 yeni anahtar
scripts/loop-verify.mjs            3 yeni frontend/mobil spec
docs/                              SAYFA-HARITASI, GUNLUK-AKIS-DENETIMI,
                                   PILOT-LAUNCH-CHECKLIST, route-optimization-plan
```

---

## 4. Testler

### Çalışan
| Kontrol | Sonuç |
|---|---|
| `tsc --noEmit` (backend + frontend + mobil) | ✅ temiz |
| `npm test` (backend) | ✅ **404/404** |
| Frontend/mobil birim testleri | ✅ 22/22 |
| `tenant-isolation-check` | ✅ geçiyor |
| `codec8-sim \| verify-tacho-telematics` | ✅ **3/3** (düzeltme sonrası) |
| Takograf kural motoru (561/2006) | ✅ 33/33, 25 spec dosyası |
| Production build (backend + frontend) | ✅ hatasız |
| `eslint` (frontend) | ✅ 0 hata (26 mevcut uyarı) |

### Başarısız / yapılmamış
- **Karantina akışı testi yok** — simülatörde CRC hatası üreten senaryo bulunmuyor
- **Gerçek yük testi yapılmadı** — `k6-smoke.js` CI'da yalnızca varlık kontrolü; `load`
  senaryosu 5 kayıt gönderiyor, gerçek yük değil
- **CI'nin yeşil geçtiği doğrulanmadı** — `gh` yetkilendirilmemiş
- **Mobil uygulama çalıştırılamadı** — Xcode ve Android SDK yok; Expo web `expo-sqlite`
  yüzünden açılmıyor
- **Yedek/restore testi** — üretim ortamı gerektiriyor

---

## 5. Bilinen sorunlar

### Kırmızı — pilottan önce kapatılmalı

| # | Sorun | Etki |
|---|---|---|
| **G1** | Fotoğraf şifreleme anahtarsız çalışıyor | Ehliyet/arıza fotoğrafları **şifresiz** saklanıyor; tek uyarı bir log satırı. Düzeltmesi `env.validation.ts`'e 2 kontrol — takograf anahtarı için aynı desen zaten var |
| **G2** | Prod env şablonu eksik | Kod 153 değişken okuyor, şablon 42'sini tanımlıyor; şifreleme anahtarları ve ingest token'ları belgelenmemiş |
| **G3** | Datenschutz eksik veri kategorileri | Takograf, **davranış skorlaması (profilleme)**, telematik, ceza verisi (DSGVO Art. 10), çalışma seansları, mesaj içerikleri metinde yok |
| **G5** | Karantina akışı test edilmiyor | Bozuk paket geldiğinde ne olduğu bilinmiyor |
| **G6** | Gerçek yük testi yok | 100+ cihazlı pilotta davranış bilinmiyor |
| **B1** | Faturalama menüde görünmüyor | Muhasebecinin ana aracı. `Sidebar.tsx`'teki `NAV_ITEMS` ile `lib/navigation.ts` çelişiyor; Sidebar kesişimi alıyor |
| **B2** | Yakıt kartı sayfası hiçbir menüde yok | 283 satır, gerçek API'ye bağlı, erişilemiyor |
| **B3** | Sürücü web portalında tur ekranı yok | Mobilde var; web+mobil parite kararı gereği boşluk |

### Hukuki — avukat kararı gerektirir
- **G4** Konum takibinin dayanağı **"onay"** olarak kurulmuş. Sistem bunu titizlikle uyguluyor
  (`locationTrackingConsentAt`, ayrı uç, denetim kaydı, GDPR dışa aktarımında koşullu ekleme),
  ancak Almanya'da iş ilişkisinde onayın geçerli dayanak olup olmadığı tartışmalıdır
  (§26 BDSG + Betriebsvereinbarung beklenebilir). **Tasarımın tamamı buna oturuyor.**
- **Betriebsrat / §87 BetrVG onayı** — konseyi olan müşteride sözleşme öncesi kapı

### Teknik sınırlar ve altyapı
- Ne görevi ne `currentDriverId`'si olan araç hâlâ konum yazamaz
  (`DriverLocationHistory.driverId` zorunlu; şema değişikliği gerekir)
- **Migration checksum drift'i** — 3 migration uygulandıktan sonra değiştirilmiş;
  `migrate deploy` çalışıyor ama `migrate dev` reset istiyor
- **Sapma raporu veri besleyemiyor:** 977 görevin 972'si NRW tile kapsamı dışında,
  107 aracın 57'sinde tüketim değeri boş, uygun 3 araç-günde alış=teslim (0 km plan)
- **Cihaz eşleştirme akışı (T5) yok** — `devices` modülü CRUD'da kalmış
- **Cihaz sahada hiç denenmedi**
- **Mobil uygulama dağıtılmamış** — `eas.json` yok
- **Her sürücü özelliği iki kez yapılmalı** (web + mobil kararı)

### Düzeltilen yanlış teşhisler (kayıt için)
- ~~"Valhalla 40t aracı B51'e sokuyor"~~ → A57 %83, B51 %1. **Kalibrasyon iptal edildi.**
- ~~"45 düz menü maddesi, hiyerarşi yok"~~ → `lib/navigation.ts` zaten gruplu ve rol duyarlı
- ~~"Konum saklama politikası yok"~~ → `retention.job.ts` günlük 03:00, varsayılan **90 gün**

---

## 6. Sıradaki görevler

### Hızlı kazanımlar (her biri dakikalar)
1. `env.validation.ts`'e fotoğraf şifreleme anahtarı kontrolleri ekle **(G1)**
2. `Sidebar.tsx` → `NAV_ITEMS`'a `/invoicing` ekle **(B1)**
3. Yakıt kartı sayfasını menüye bağla **(B2)**

### Orta
4. `.env.production.example`'ı tamamla — anahtarlar, token'lar, saklama süreleri **(G2)**
5. Datenschutz metnine eksik veri kategorilerini ekle **(G3)**
6. Karantina senaryosu (CRC hatası) simülatöre eklensin **(G5)**
7. k6 yük testini gerçekten çalıştır, 100+ cihaz senaryosu **(G6)**
8. Sürücü web portalına tur ekranı **(B3)**
9. Migration checksum drift'ini temizle

### Faz 2'nin kalanı
10. **OR-Tools mikroservisi** — kapasite, zaman penceresi, takograftan kalan sürüş süresi
11. **Maut hesabı + Sonntagsfahrverbot katmanı** — farklılaşma alanı, rakiplerde yok
12. Tüm Almanya Valhalla tile build'i + self-hosted Photon (üretim sunucusunda)

### Pilot öncesi (kod dışı)
13. Cihaz eşleştirme akışı (T5)
14. Gerçek araçta bir tam gün saha provası
15. Mobil uygulama dağıtımı (TestFlight/internal)
16. Avukat görüşü: konum takibi hukuki dayanağı + Betriebsrat
17. Steuerberater onayı: e-fatura vergi doğruluğu
18. Pilot kapsamı, eğitim, destek kanalı, başarı kriteri — yazılı

---

## Geliştirme ortamı

| Servis | Port |
|---|---|
| Backend | 3000 |
| Frontend | 3001 |
| Valhalla | 8002 |
| Telematik ağ geçidi | 5027 |
| Redis | 6379 |

```bash
docker compose up -d valhalla
cd backend && REDIS_URL=redis://localhost:6379 npx ts-node --transpile-only src/telematics-gateway/main.ts
```

**Doğrulama bataryası** (CLAUDE.md gereği her değişiklik setinden sonra):
```bash
cd backend && npx tsc -p tsconfig.json --noEmit
npm test
node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs
npx ts-node --transpile-only scripts/tenant-isolation-check.ts
```
