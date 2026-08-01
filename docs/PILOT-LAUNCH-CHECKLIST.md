# Fleet / Operion — Pilot ve Lansman Checklist

**Öncelik sırası:** güvenlik → hukuki uygunluk → veri bütünlüğü → operasyon → pazarlama.

**Durum işaretleri:**
`✅` bu oturumda doğrulandı · `⚠️` bilinen açık · `❓` doğrulanmadı, kontrol edilmeli

> Fleet bir pazarlama sitesi değil: çok kiracılı, çalışan konum verisi işleyen, donanım
> içeren, regüle edilmiş takograf verisi tutan bir B2B sistem. Bu liste o farklara göre
> yazıldı; bir web sitesi checklist'inden kopyalanamaz.

---

## 0. Lansman kararı için zorunlu kapılar

Bunlardan biri bile kapanmadıysa pilot başlamaz.

- [ ] ⚠️ **Kiracı izolasyonu kanıtlanmış olmalı** — `tenant-isolation-check.ts` yeşil, ve
      pilot müşteri verisiyle **ikinci bir tenant** oluşturularak çapraz okuma denenmiş olmalı.
      *(Tek tenant'la yeşil olması yeterli kanıt değil — bugün Tour/TourStop 0/0 ile geçti,
      yani hiçbir şey kanıtlamadı.)*
- [x] ✅ **DSGVO: konum verisi saklama uygulanmış** — `retention.job.ts` her gün 03:00 Europe/Berlin'de çalışıyor, **varsayılan açık** (`RETENTION_CRON_ENABLED=false` ile kapatılır). Konum geçmişi varsayılanı **90 gün**, denetim kaydı 730, mesajlar 730. Testi mevcut.
      *Kalan iş: süreler production env'de açıkça yazılmalı, varsayılana bırakılmamalı.*
- [ ] ❓ **Betriebsrat / §87 BetrVG onayı** — çalışan konumu izleniyorsa işçi konseyi
      onayı yazılı olmalı. Konseyi olan müşteride bu, sözleşme öncesi kapıdır.
- [ ] ❓ **Cihaz sahada kanıtlanmış olmalı** — en az bir gerçek araçta, gerçek cihazla,
      tam bir gün. Bugüne kadar hiç yapılmadı.
- [ ] ⚠️ **Cihaz eşleştirme akışı (T5)** — IMEI→araç eşleştirme arayüzü yok, `devices`
      modülü CRUD'da kalmış. Donanımlı pilotta kurulum bunsuz yapılamaz.
- [ ] ❓ **Mobil uygulama dağıtımı** — TestFlight/internal veya store. `eas.json` yok.
- [ ] ❓ **Yedekleme ve geri yükleme testi** — en az bir kez gerçek restore denenmiş olmalı.
- [ ] ❓ **Geri dönüş (rollback) planı** yazılı ve ekiple paylaşılmış olmalı.
- [ ] ❓ **Hukuki onay yazılı olarak alınmış olmalı** (AVV, Impressum, Datenschutz, AGB).

---

## 1. Altyapı ve teknik lansman

- [ ] 🔴 **Production ortam değişkenleri EKSİK** — kod 153 değişken okuyor, `.env.production.example` 42'sini tanımlıyor. Çoğunun makul varsayılanı var, ama şunlar mutlaka eklenmeli: `LICENSE_PHOTO_ENCRYPTION_KEY`, `DEFECT_PHOTO_ENCRYPTION_KEY`, `TACHO_PROVIDER_CREDENTIAL_ENCRYPTION_KEY`, `DEVICE_INGEST_TOKEN`, `TACHO_INGEST_TOKEN`, `REDIS_URL`, ve tüm `*_RETENTION_DAYS` (DSGVO için varsayılana bırakılmamalı)
- [x] ✅ **`NODE_ENV=production` build hatasız** — backend (`nest build`) ve frontend (`next build`, tüm sayfalar) 2026-08-01'de doğrulandı
- [ ] ❓ Tüm migration'lar production veritabanına uygulanmış
      *(Dikkat: repoda migration checksum drift'i var — `add_ddd_file_processing_status`,
      `tacho_infringement_acknowledge`, `equipment_issuance_rev3_form_pdf` uygulandıktan
      sonra değiştirilmiş. `prisma migrate deploy` çalışıyor ama `migrate dev` reset istiyor.
      Production'a çıkmadan bu temizlenmeli.)*
- [ ] ❓ Otomatik veritabanı yedeği açık (`docs/ops/BACKUP-CRON.md` mevcut)
- [ ] ❓ Restore testi en az bir kez yapılmış (`docs/ops/DISASTER-RECOVERY.md`)
- [ ] ✅ **CI tetikleyicisi doğru** — `main, master, develop, faz-a, feature/**`
- [ ] ❓ CI'nin gerçekten yeşil geçtiği doğrulanmış *(bu oturumda `gh` yetkisi yoktu)*
- [ ] ✅ **Doğrulama bataryası yeşil** — tsc + 404/404 test + tenant isolation +
      codec8-sim | verify-tacho-telematics
- [ ] ❓ Sentry/hata izleme production'da aktif ve test edilmiş
- [ ] ❓ Metrikler ve `/health` ucu izleniyor (`docs/ops/OBSERVABILITY-PROD.md`)

## 2. Alan adı, hosting, e-posta

- [ ] ❓ DNS kayıtları doğru hedefi gösteriyor
- [ ] ❓ www ve www'suz tek adrese yönleniyor
- [ ] ❓ HTTPS zorunlu; HTTP → HTTPS yönlendirmesi çalışıyor
- [ ] ❓ SSL sertifikası aktif ve hatasız
- [ ] ❓ E-posta sağlayıcısında gönderen alan adı doğrulanmış (Resend — `docs/ops/SMTP-GO-LIVE.md`)
- [ ] ❓ SPF, DKIM, DMARC kayıtları doğrulanmış
- [ ] ❓ **Sürücü davet e-postası** test edilmiş (mobil/web onboarding buna bağlı)
- [ ] ❓ **Hatırlatma e-postaları** (muayene, ehliyet, servis) gerçekten gidiyor
- [ ] ❓ **Fatura gönderimi** — e-fatura eki ile müşteriye ulaşıyor

## 3. Güvenlik ve erişim

- [x] ✅ **`JWT_SECRET` açılışta zorlanıyor** — `env.validation.ts` production'da min 32 karakter şartı koyuyor ve `.env.example`'daki placeholder değerleri yasaklı listede; uygulama başlamıyor
- [x] ✅ **Seed production'da engelleniyor** — `assertSeedAllowed()` `NODE_ENV=production`'da hata fırlatıyor; şifre verilmezse rastgele üretiliyor
- [x] ✅ **Hız sınırı aktif** — global 100 istek/dk (`ThrottlerModule.forRoot`), hassas uçlarda daha sıkı: giriş 20/dk, gizlilik uçları 5-10/dk, müşteri portalı 20-30/dk, arama 60/dk
- [x] ✅ **Cihaz/takograf ingest guard'ları kapalı düşüyor** — token yoksa `ServiceUnavailableException`, sessizce açılmıyor
- [ ] 🔴 **Fotoğraf şifreleme AÇIK düşüyor** — `LICENSE_PHOTO_ENCRYPTION_KEY` veya `DEFECT_PHOTO_ENCRYPTION_KEY` yoksa fotoğraflar **şifresiz** saklanıyor; tek uyarı bir log satırı. Ehliyet fotoğrafı kimlik belgesidir.
      *Not: bu bir tasarım hatası değil, atlanmış bir madde — `env.validation.ts` takograf şifreleme anahtarı için aynı kontrolü zaten yapıyor. Düzeltmesi o dosyaya iki kontrol eklemek.*
- [x] ✅ **Oto-giriş / Swagger / açık kayıt güvenli varsayılanlı** — yalnızca açıkça `'true'` yazılırsa açılıyor; `COOKIE_SECURE` yalnızca açıkça `'false'` ile kapanıyor
- [x] ✅ **Yüklenen dosyalar herkese açık değil** — statik servis yok (`express.static`/`ServeStatic` kullanılmıyor); indirme guard'lı controller üzerinden, rol kontrolü ve kullanıcı bazlı çözümleme ile, ayrıca her indirme kaydediliyor
- [x] ✅ **Dosya tipi ve boyut sınırları aktif** — `MAX_FILE_SIZE_BYTES`, `fileFilter`, `ParseFilePipeBuilder`
- [x] ✅ **Loglarda açık kişisel veri yok** — log satırları tarandı; e-posta, şifre, token, IBAN, konum içeren log bulunamadı
- [ ] ✅ **Rol bazlı yetkilendirme çalışıyor** — sürücü token'ı ile ofis ucuna yazma denemesi
      reddedildi (401)
- [x] ✅ **CORS açılışta zorlanıyor** — production'da `CORS_ORIGIN` tanımsızsa uygulama başlamıyor
- [x] ✅ **Denetim kaydı kapsamlı** — 164 farklı işlem: giriş başarılı/başarısız, hız limiti, MFA kurulum/doğrulama, şifre değişikliği, görev oluşturma/güncelleme/iptal, faturalama
- [x] ✅ **Production açılış kapısı var** (`env.validation.ts`) — yanlış yapılandırmayla uygulama başlamıyor: zayıf JWT, SMTP kapalı, placeholder veri sorumlusu/gizlilik e-postası, S3 yerine yerel depolama, tanımsız CORS, varsayılan takograf şifreleme anahtarı

## 4. Hukuki uygunluk — Almanya

- [ ] ❓ Impressum güncel
- [ ] ❓ Datenschutzerklärung güncel ve **konum takibini, takograf verisini, sürücü
      davranış skorlamasını** açıkça kapsıyor
- [ ] ❓ AGB erişilebilir
- [ ] ❓ AVV (Auftragsverarbeitungsvertrag) şablonu hazır — `frontend/public/legal/` altında var
- [ ] ❓ Çerez ayarları sayfası çalışıyor
- [ ] ❓ **Takograf verisi saklama süreleri** yasal sınırlara uygun (DDD arşivi, aktivite kayıtları)
- [ ] ❓ **E-fatura yasal uygunluğu** — ZUGFeRD/XRechnung teknik olarak üretiliyor
      (`einvoice/cii-xml.ts`, `ubl-xml.ts`, XRechnung 3.0 golden dosyası ✅), ama
      **vergi açısından doğruluğu Steuerberater onayı ister**
- [ ] ❓ GoBD: fatura ve muhasebe verisi değiştirilemezlik/saklama gereklerine uygun
- [ ] ❓ Sürücü verisinin silinmesi (GDPR Art. 17) uçtan uca çalışıyor
- [ ] ❓ Abartılı veya garanti veren pazarlama iddiaları kaldırılmış

## 5. Veri bütünlüğü ve göç

- [ ] ❓ Pilot müşterinin araç/sürücü/firma verisi içe aktarılmış (`/import` CSV)
- [ ] ❓ İçe aktarım sonrası **kiracı izolasyonu tekrar doğrulanmış**
- [ ] ⚠️ **Adres verisi koordinatlanmış** — `backfill:assignment-locations` çalıştırılmış.
      *Dikkat: geliştirme haritası sadece NRW; production'da tüm Almanya tile build'i
      (~10 GB, ~5 saat) gerekli, yoksa görevlerin çoğu `check_failed` kalır.*
- [ ] ❓ Araçlara ortalama tüketim (`avgConsumptionLPer100Km`) girilmiş
      *(demo veride 107 aracın 57'sinde boş — sapma raporu bunsuz euro hesaplayamaz)*
- [ ] ❓ Fatura numara serisi (`InvoiceNumberSequence`) pilot için doğru başlatılmış
- [ ] ❓ Ücret kartları (`RateCard`) tanımlı — yoksa fatura satırı fiyatlanamaz

## 6. Rota ve harita altyapısı

- [ ] ⚠️ **Valhalla production'da tüm Almanya tile'ı ile çalışıyor**
      (geliştirmede sadece NRW — ~5 saat build, ~10 GB disk, 16 GB RAM önerilir)
- [ ] ⚠️ **Photon self-hosted** — geliştirmede public API kullanılıyor; production'da
      adil kullanım koşulları ve GDPR nedeniyle self-host şart (`PHOTON_URL`)
- [ ] ❓ Redis rota önbelleği aktif (`REDIS_URL`) — ölçüm: sıcak cache 7-9× hızlı
- [ ] ❓ `ROUTING_ACCESS_PROBE_LAT/LON` pilot bölgesine uygun ayarlanmış

## 7. İş akışı doğrulaması — rol bazlı

Detayı: `docs/GUNLUK-AKIS-DENETIMI.md`

**Office / Disponent**
- [ ] ✅ Günlük özet, sabah check-in'leri, çıkış kontrolleri, arızalar açılıyor
- [ ] ✅ Kalan sürüş süresi hesaplanıyor
- [ ] ✅ Canlı takip haritası araçları gösteriyor
- [ ] ✅ Yeni görev formu (adres otomatik tamamlama + harita) çalışıyor
- [ ] ✅ Bekleyen işler kuyruğu aciliyete göre sıralı
- [ ] ❓ **Görev oluşturma uçtan uca** — kaydet, sürücüye düşsün, mobilde görünsün
- [ ] ❓ Tur oluştur → optimize et → sürücüye aç akışı gerçek veriyle

**Muhasebe**
- [ ] ⚠️ **Faturalama menüden erişilemiyor** — `NAV_ITEMS` ile `navigation.ts` çelişiyor (B1)
- [ ] ⚠️ **Yakıt kartı mutabakatı sayfası hiçbir menüde yok** (B2)
- [ ] ❓ Görev → fatura → kesinleştir → e-fatura gönder akışı uçtan uca
- [ ] ❓ DATEV dışa aktarımı muhasebeci tarafından açılıp doğrulanmış
- [ ] ❓ Bordro için çalışma saati çıktısı doğru

**Sürücü**
- [ ] ✅ Web portalına giriş çalışıyor
- [ ] ⚠️ **Web portalında tur ekranı yok** (mobilde var) (B3)
- [ ] ❓ Mobil uygulama gerçek telefonda: check-in, çıkış kontrolü, görev, navigasyon
- [ ] ❓ Çevrimdışı kuyruk — kapsama olmayan yerde veri kaybolmuyor
- [ ] ⚠️ Açık vardiya onay ekranı sürücüyü kilitleyebiliyor (B5)

## 8. Telematik ve takograf

- [ ] ✅ **Konum yazma hatası düzeltildi** — görev atanmamış araçta konum sessizce
      düşüyordu; `currentDriverId`'ye düşülüyor ve çözülemezse uyarı loglanıyor
- [ ] ⚠️ **Kalan sınır:** ne görevi ne `currentDriverId`'si olan araç hâlâ konum yazamaz
- [ ] ❓ Cihaz→araç eşleştirme yapılmış ve doğrulanmış
- [ ] ❓ Cihaz kopunca uyarı geliyor (offline tespiti)
- [ ] ❓ DDD dosyası yükleme ve arşivleme gerçek dosyayla test edilmiş
- [ ] ❓ İhlal tespiti gerçek veriyle doğrulanmış (561/2006 motoru)
- [ ] ❓ Karantina akışı (CRC hatası → inceleme) uçtan uca çalışıyor

## 9. Analitik ve dönüşüm (pazarlama sitesi tarafı)

- [ ] ❓ Analytics ID doğru ortamda tanımlı
- [ ] ❓ Çerez onayı verilmeden izleme başlamıyor
- [ ] ❓ Onay sonrası temel olaylar doğru kaydediliyor
- [ ] ❓ Dashboard/uygulama sayfaları izleme dışında
- [ ] ❓ UTM parametreleri yakalanıyor
- [ ] ❓ Dönüşüm olayları doğrulanmış: demo talebi, fiyat sayfası, kayıt başlangıcı

## 10. Pilot özel — müşteriye teslim

- [ ] ❓ **Pilot kapsamı yazılı** — hangi modüller dahil, hangileri değil
- [ ] ❓ Pilot müşteride kullanıcılar oluşturulmuş, roller atanmış
- [ ] ❓ Eğitim yapılmış (dispatcher, muhasebe, sürücüler ayrı)
- [ ] ❓ Destek kanalı tanımlı ve müşteri biliyor (kim, hangi saatlerde, nereden)
- [ ] ❓ Hata bildirimi için kanal ve şablon hazır
- [ ] ❓ Pilot süresi ve başarı kriteri yazılı ("neyi görürsek başarılı sayacağız")
- [ ] ❓ Pilot müşteri verisi için ayrı yedekleme doğrulanmış
- [ ] ❓ Pilotu geri alma senaryosu — müşteri vazgeçerse verisi ne olacak

## 11. Lansman günü hızlı testi

1. [ ] Ana sayfa açılıyor, performans kabul edilebilir
2. [ ] Her rol için giriş yapılıyor (office, muhasebe, sürücü)
3. [ ] Bir görev oluşturuluyor ve sürücüde görünüyor
4. [ ] Sürücü mobilden check-in ve çıkış kontrolü yapıyor
5. [ ] Canlı haritada en az bir araç görünüyor
6. [ ] Bir fatura kesiliyor ve e-fatura üretiliyor
7. [ ] Bildirim e-postası alınıyor
8. [ ] Çerez onayı ve analitik akışı doğrulanıyor
9. [ ] Yedekleme çalıştı mı kontrol ediliyor
10. [ ] Hata izleme panelinde beklenmedik hata yok

---

## Bilinen açıklar — pilottan önce karar gerektirir

| # | Konu | Etki |
|---|---|---|
| B1 | Faturalama menüde yok | Muhasebeci ana aracına ulaşamıyor |
| B2 | Yakıt kartı sayfası menüde yok | Yazılmış özellik kullanılamıyor |
| B3 | Sürücü webinde tur yok | Web+mobil parite kararı gereği boşluk |
| — | Cihaz eşleştirme akışı yok | Donanımlı pilotta kurulum engeli |
| — | Mobil uygulama dağıtılmamış | Sürücüler uygulamayı alamaz |
| — | Migration checksum drift | Production migration riski |
| — | Almanya tile build'i yok | Rota/sapma raporu NRW dışında çalışmaz |
| — | Araç tüketim verisi eksik | Sapma raporu euro hesaplayamaz |
| **G1** | **Fotoğraf şifreleme anahtarsız çalışıyor** | Ehliyet/arıza fotoğrafları şifresiz saklanır (DSGVO) |
| **G2** | **Production env şablonu eksik** | Şifreleme anahtarları ve token'lar belgelenmemiş |
