# Fleet / Operion — Pilot Hazırlık Raporu

**Denetim tarihi:** 10.08.2026
**Denetlenen dal:** `chore/mock-temizligi-ve-pilot-verisi` (63 commit'lenmemiş dosya)
**Yöntem:** Bu rapordaki her iddia, denetim anında **çalışan backend'e ve gerçek geliştirme
veritabanına** karşı yeniden ölçüldü. Eski durum dokümanları kaynak olarak kabul edilmedi;
yalnızca *yeniden yargılanacak iddia listesi* olarak kullanıldı (bkz. §13, §15).

---

## 1. Yönetici Özeti

Ürünün **kodu** pilot için büyük ölçüde hazır. Ürünün **verisi ve saha kurulumu** hazır değil.

Üç personanın günlük akışı canlı API'ye karşı uçtan uca koşturuldu ve **çalışıyor**: ofis iş
oluşturup güncelleyebiliyor, sürücü o işi görüyor, Abfahrtskontrolle → mesai başlat → mola →
mesai bitir zinciri tamamlanıyor, ofis vardiyayı ve mola adaylarını görüyor. Doğrulama
bataryasının beş adımı da yeşil: tip kontrolü, 693/693 test, telematik simülasyonu, takograf
doğrulaması ve kiracı izolasyonu.

Buna karşılık pilot bugün başlayamaz. Sebep tek cümleyle: **pilot şirketin verisi sistemde
yok.** 45 sürücünün 44'ünün kullanıcı hesabı yok — giriş yapamazlar; filoda 1 araç kayıtlı;
gerçek telematik cihazı sıfır. Telematik hattı yalnızca **simülatörle** doğrulandı (ingest →
konum → 1 kapalı trip). Gerçek bir araçta, gerçek bir cihazla, gerçek bir iş günü boyunca
telemetrinin hayatta kalıp kalmadığının ölçülmüş bir cevabı yok — pilot başarı ölçütünün tam
da bunu istediği yerde.

Bunlar mimari sorunlar değil, **provisioning ve saha kurulumu** sorunları. 20 gün, doğru
sırayla kullanılırsa yeterli. Kritik yol veri ve donanımdır, yazılım değil.

**Bugünkü karar: NO-GO.** Engelleyiciler §17'deki ölçütlerle kapatılabilir durumda.

### 1.1 Denetim sırasında yapılan değişiklikler

Denetim kural olarak salt-okunurdu. İki istisna, ikisi de kanıtlanmış P0 kapsamında:

1. **P0-4 düzeltmesi (kod):** `BreakCandidate`, `tenant-isolation-check.ts` kapsamına alındı.
   CLAUDE.md Kural 2 ihlaliydi ve yeni bir tablonun kiracı sızdırmadığı kanıtsızdı.
2. **Test koşum cihazı (veri):** `359339080000101` IMEI'li cihaz mevcut araca bağlandı;
   yalnızca doğrulama bataryasının telematik adımlarını çalıştırabilmek için. Pilot cihazı
   değildir ve P0-2'yi kapatmaz.

Ayrıca denetim sırasında üretilen test verisi (1 assignment, kalkış kontrolü, vardiya
olayları) temizlendi ya da iptal edildi.

---

## 2. Pilot Kapsamı

**Başarı ölçütü:** "Gerçek bir şirket iş günü, kritik operasyonel arıza olmadan Fleet
üzerinde tamamlanabiliyor."

**Kapsam içi:** ofis günlük operasyonu (Einsatzplan, iş oluşturma/atama, tur, gün izleme,
anomali/çalışma süresi incelemesi), sürücü günü (giriş, kalkış kontrolü, iş/turlar, mola ve
takograf mutabakatı, mesai bitişi), patron görünümü (dashboard, sürücü/araç durumu, açık
problemler), Zeiterfassung + takograf mutabakatı, telematik canlı takip, üretim
yapılandırması ve kiracı izolasyonu.

**Kapsam dışı (dondurulmuştur):** Schichtmodell/WorkSchedule, fiziksel zaman terminali, GPS
makullük denetimi, OR-Tools genişletmesi, yeni sektör uyarlamaları, DATEV bordro yazıcısı,
yeni muhasebe özellikleri, spekülatif entegrasyonlar, büyük mimari yeniden yapılandırmalar.

Bu rapor kapsam dışı kalemler için **iş üretmez**; yalnızca §14'te kayıt altına alır.

---

## 3. Mevcut Sistem Durumu

### 3.1 Doğrulama bataryası (CLAUDE.md, denetimde yeniden çalıştırıldı)

| Adım | Sonuç | Not |
|---|---|---|
| `tsc --noEmit` (backend) | ✅ yeşil | |
| `npm test` | ✅ **693/693**, 108 spec dosyası | |
| `codec8-sim --scenario normal --seed 42` | ✅ yeşil *(düzeltme sonrası)* | İlk ölçümde kırmızıydı: `login rejected imei=…` — DB'de kayıtlı cihaz yoktu |
| `verify-tacho-telematics.mjs` | ✅ `ok: true` *(düzeltme sonrası)* | 5 kayıt kabul, 5 konum noktası, **1 trip kapandı**, karantina 0 |
| `tenant-isolation-check.ts` | ✅ yeşil | `BreakCandidate` **kapsama alındı** (P0-4 kapatıldı): A=2, B=0 |

**Batarya şu an tam yeşildir.** İki telematik adımı denetim başında kırmızıydı; sebebi kod
değil veri ön koşuluydu (kayıtlı cihaz yok). Denetim sırasında `359339080000101` IMEI'li
**test koşum cihazı** mevcut araca bağlandı ve adımlar yeşile döndü. Bu, ingest → konum →
trip hattının **simülatör düzeyinde çalıştığını kanıtlar; gerçek donanımı kanıtlamaz** —
P0-2 açık kalır.

### 3.2 Şema ve migration

- 77 migration; `prisma migrate status` → **"Database schema is up to date"**.
- Son iki migration bu oturumda uygulandı: `20260810120000_payroll_provider_agnostic`,
  `20260810140000_break_candidate`.
- Migration ↔ şema farkı `prisma migrate diff` ile ölçüldü: pilot yollarında (bordro, mola
  adayı) fark yok. Alakasız 6 satırlık eski drift mevcut (`EquipmentIssuance` varsayılanları,
  `TourStop`/`WorkSession`/`handover_photos`/`tacho_infringements` indeksleri) — pilotu
  etkilemiyor, bilerek dokunulmadı (P2).

### 3.3 Veri envanteri (gerçek dev veritabanı)

| Varlık | Adet | Pilot etkisi |
|---|---|---|
| Tenant | 3 (`default-tenant`, `qa-p0-tenant-a`, `qa-p0-tenant-b`) | Pilot verisi QA kiracılarıyla aynı veritabanında |
| Kullanıcı | 26 (18 aktif) | `qa-crud-*` artıkları mevcut |
| Sürücü | 45 (45 aktif) | **yalnızca 1'i kullanıcıya bağlı** |
| Araç | **1** | Filo yok |
| Firma/müşteri | 10 | Yeterli görünüyor, içerik doğrulanmadı |
| Cihaz (telematik) | 1 (**test koşum cihazı**, denetimde eklendi) | Gerçek pilot cihazı hâlâ **0** |
| Assignment | 0 | Einsatzplan boş |
| Tur | 0 | |
| WorkSession / WorkTimeEvent | 3 / 8 | Denetim sırasında üretilen test verisi |
| BreakCandidate | 2 | Denetim sırasında üretildi ve karara bağlandı |
| TachoActivity / DddFile | 0 / 0 | Takograf tarafında gerçek veri yok |
| DriverPayrollProfile / TenantPayrollProfile | **0 / 0** | Bordro ihracatı yapılandırılmamış |

---

## 4. Tamamlanmış Modüller

Aşağıdakiler denetimde **canlı API'ye karşı** yanıt verdiği doğrulanmış modüllerdir.
"Tamamlanmış" = uç çalışıyor ve beklenen şekli döndürüyor; iş kuralı derinliği ayrıca
belirtilmediyse doğrulanmamıştır.

- Kimlik doğrulama ve rol tabanlı yetkilendirme (`office`/`boss`/`driver` girişleri 200)
- Assignment yaşam döngüsü: oluştur / listele / güncelle / iptal
- Einsatzplan veri kaynakları: takvim, transport talepleri, sabah check-in'leri
- Sürücü portalı: profil, günün görevleri, kalkış kontrolü, vardiya, Zeiterfassung, mola adayları
- Turlar: ofis (`/routing/tours`) ve sürücü (`/driver/tours/today`)
- Dashboard (patron): KPI, kritik uyarılar, bugünün operasyonu, yarının planı
- Takograf: rozetler, ihlal listesi
- Çalışma süreleri (ofis) ve mola adayı onay/ret akışı
- Telematik okuma yüzeyi: canlı takip listesi, araç sağlığı
- Bildirimler, gizlilik/retention işi, denetim kaydı

---

## 5. Ofis Günlük Akışı — Doğrulama

Canlı API, `office@fleet.com` ile:

| Adım | Sonuç |
|---|---|
| Giriş | ✅ 200 |
| Einsatzplan takvimi / transport talepleri / sabah check-in | ✅ 200 (0 kayıt — veri yok) |
| Sürücü / araç / firma listeleri | ✅ 200 |
| **Assignment oluştur** | ⚠️ ilk denemede **400** — `Digitale Führerscheinkontrolle ungültig oder überfällig (Halterhaftung)` |
| Assignment oluştur (onay bayrağıyla) | ✅ 200 |
| Listede görünüyor | ✅ 1 kayıt |
| Assignment güncelle (PATCH) | ✅ 200 |
| İptal (`POST :id/cancel`) | ✅ 200 |
| Çalışma sürelerini görüntüle | ✅ 3 kayıt |
| Mola adaylarını görüntüle | ✅ 200 |

**Bulgu (P0-8):** Pilot sürücülerinin hiçbirinde geçerli dijital ehliyet kontrolü yok. Bu
haliyle ofis **her iş oluşturmada** Halterhaftung uyarısını elle onaylamak zorunda. Kapı
doğru tasarlanmış (§21a StVG sorumluluğu), ama pilotta her gün tıklanan bir uyarı kısa sürede
anlamsızlaşır ve gerçek bir ihlali gizler. Pilot öncesi sürücü ehliyet kontrolleri girilmeli.

**Not:** Assignment için `DELETE` ucu yoktur; iptal `POST /assignments/:id/cancel` iledir.
Bu bilinçli bir tasarım (denetim izi korunuyor) — eksiklik değil.

---

## 6. Sürücü Günlük Akışı — Doğrulama

Canlı API, `driver@fleet.com` ile, gerçek sırayla:

| Adım | Sonuç |
|---|---|
| Giriş | ✅ 200 |
| Profil (`/driver/me`) | ✅ sürücü kimliği çözülüyor |
| Günün görevleri | ✅ ofisin yarattığı işi görüyor (1 kayıt) |
| **Mesai başlat (kontrolsüz)** | ⚠️ **400** — `Abfahrtskontrolle für heute erforderlich` |
| Kalkış kontrolü durumu | ✅ şablon 7 maddeyle geliyor |
| **Kalkış kontrolü gönder** | ✅ 200 (7 madde `ok`) |
| Mesai başlat | ✅ 200 |
| Mola başlat / bitir | ✅ 200 / 200 |
| Zeiterfassung özeti | ✅ `state=working`, mola ve brüt dakika hesaplanıyor |
| Mesai bitir | ✅ 200 |

Sürücü günü **uçtan uca çalışıyor**. Mesai başlatmanın kalkış kontrolüne bağlı olması bir
hata değil, tasarlanmış kapıdır; sürücü eğitim materyalinde ilk madde bu olmalıdır.

**Kritik kısıt (P0-1):** Bu akış yalnızca kullanıcı hesabı olan sürücüde çalışır. Bugün 45
sürücünün 44'ünde `driver.userId` boş — o sürücüler giriş yapamaz, dolayısıyla pilotta
çalışamaz.

---

## 7. Patron Akışı — Doğrulama

Canlı API, `boss@fleet.com` ile:

| Adım | Sonuç |
|---|---|
| Giriş | ✅ 200 |
| Dashboard | ✅ `kpis`, `criticalAlerts`, `todayOperations`, `tomorrowPlanning` |
| Sürücü / araç durumu | ✅ 200 |
| Canlı takip (`/tracking/live`) | ✅ 200 — **0 kayıt** (cihaz yok) |
| Araç sağlığı | ✅ 200 |
| Takograf rozetleri | ✅ 200 |
| Açık ihlaller | ✅ 200 — 0 kayıt |

Patron yüzeyi çalışıyor ama **boş**. Cihaz ve gerçek gün verisi girene kadar bu ekranların
karar destekleyici olup olmadığı ölçülemez.

---

## 8. Zeiterfassung + Takograf

Bu hat, kullanıcı tarafından "kritik hata bulunmadıkça özellik-tam" ilan edildi. Denetim bunu
destekliyor:

- `WorkTimeEvent` append-only; toplamlar saklanmıyor, her okumada olaylardan hesaplanıyor.
- Ofis düzeltmesi yeni olay yazıp eskisinin üstünü çiziyor (`supersedesEventId`).
- Takograf **kaydı değiştirmiyor**: `TachoActivity` → `BreakCandidate` → insan onayı →
  `WorkTimeEvent`. Bordro yalnızca onaylanmış olayı okuyor.
- Aday üretimi idempotent; artık türetilemeyen bekleyen adaylar geri çekiliyor; karara
  bağlanmış adaylar dokunulmaz.
- Öneri gerekçesi (`evidenceRestMinutes`, `evidenceRecordedBreakMinutes`, kaynak aktivite ve
  DDD dosya kimlikleri, `derivedAt`) satırda saklanıyor.
- Geç onaylanan mola, ihraç edilmiş dönemi sessizce değiştirmiyor: kaynak özeti değişince
  `source_changed_since_export` bildiriliyor (bloklamadan) ve fark Rückrechnung olarak açık
  döneme taşınıyor.

Bu oturumda tarayıcıda uçtan uca gösterildi: sürücü onayı sayacı 5:03 → 4:22'ye düşürdü
(41 dk), ofis onayı `break_start@12:06/office` + `break_end@12:47/office` yazdı, PayrollDay
`workedMinutes 559 = 600 − 41`, `tachoDelta 0`.

**Açık kalan:** `TachoActivity` tablosu bugün boş; yukarıdaki zincir **sentetik** veriyle
doğrulandı. Gerçek bir DDD dosyasıyla hiç çalıştırılmadı (P0-2'ye bağlı).

---

## 9. Telematik / Araç Hazırlığı

| Konu | Durum |
|---|---|
| Cihaz kaydı | ⚠️ 1 test koşum cihazı; **gerçek cihaz 0** |
| IMEI → araç eşleştirme arayüzü | ❌ yok (`devices` ucu var, UI yok) — eski checklist T5 **hâlâ açık** |
| Gateway | ✅ ayağa kalkıyor, TCP 5027 dinliyor, bağlantı kabul ediyor |
| Ingestion (codec8) | ✅ simülatörle doğrulandı — 5/5 kayıt kabul, karantina 0 |
| Canlı konum | ⚠️ uç çalışıyor; simülatör verisi akıyor, gerçek araç verisi yok |
| Trip yaşam döngüsü | ✅ simülatörle doğrulandı — 1 trip açıldı ve kapandı |
| Takograf aktivitesi | ❌ gerçek DDD ile doğrulanmadı |
| REST → BreakCandidate | ✅ mantık doğrulandı (sentetik `TachoActivity` ile), ❌ gerçek DDD ile değil |
| Tam gün saha testi | ❌ hazır değil |

Telematik, pilotun **en uzun tedarik süreli** kalemi: cihaz satın alma/kurulum, IMEI
eşleştirme, araca montaj ve bir tam gün gerçek sürüş. Bu iş 1. günde başlamazsa 20 güne
sığmaz.

---

## 10. Test Kanıtı

- **Birim/entegrasyon:** 693 test, 108 spec dosyası, 0 başarısız.
- **Kiracı izolasyonu:** `tenant-isolation-check.ts` yeşil; kapsamdaki her model için
  kapsamsız ve kapsamlı sayımlar eşleşiyor.
- **Persona okuma yüzeyi:** 29 uçtan 28'i 200 (kalan 1 benim yanlış yol tahminimdi, gerçek
  yolla doğrulandı).
- **Persona yazma yolu:** ofis→sürücü zinciri 13 adımda doğrulandı.
- **Tarayıcı:** sürücü portalı ve ofis paneli mola adayı akışı ekran görüntüsüyle doğrulandı.
- **Migration ↔ şema:** shadow veritabanında `prisma migrate diff` ile karşılaştırıldı.
- **Telematik (simülatör):** `codec8-sim` → gateway → ingest zinciri; beklenen 5 kayıt / 5
  konum / 1 kapalı trip'in tamamı `verify-tacho-telematics` tarafından `ok: true` ile
  doğrulandı.

**Kanıtı olmayanlar:** telematik uçtan uca, gerçek DDD işleme, restore, e-posta teslimi,
production yapılandırması, yük altında davranış.

---

## 11. Güvenlik / Kiracı İzolasyonu

**İyi durumda (denetimde doğrulandı):**
- Kiracı izolasyonu Prisma uzantısıyla zorlanıyor, kontrol yeşil.
- `JWT_SECRET` production'da min 32 karakter, placeholder değerler yasaklı; uygulama onsuz açılmıyor.
- CORS production'da zorunlu (`bootstrap/create-app.ts`).
- **Fotoğraf şifreleme artık açık düşmüyor** — `env.validation.ts:116` production'da
  `LICENSE_PHOTO_ENCRYPTION_KEY`'i zorunlu kılıyor ve format doğruluyor. *Eski checklist'teki
  🔴 madde geçersizdir.*
- Cihaz/takograf ingest guard'ları token yoksa kapalı düşüyor.
- Seed production'da engelli.
- Hız sınırı aktif; denetim kaydı 164 işlem tipini kapsıyor.

**Açık:**
- **P0-4 — KAPATILDI (denetim sırasında):** `BreakCandidate` `tenant-isolation-check.ts`
  kapsamına alındı; kontrol yeşil (tenant A: 2, tenant B: 0, kapsamsız sayımlarla birebir).
  CLAUDE.md Kural 2 üçlüsü artık tam.
- **P0-5:** Pilot verisi, QA kiracıları (`qa-p0-tenant-a/b`) ve `qa-crud-*` kullanıcılarıyla
  aynı veritabanında. İzolasyon kod düzeyinde çalışsa da pilot verisinin test artıklarıyla
  karışması operasyonel bir risk.

---

## 12. Üretim Hazırlığı

| Konu | Durum | Kanıt |
|---|---|---|
| Env doğrulama | ✅ var | `src/config/env.validation.ts`, production'da zorunlu alanlar |
| `.env.production.example` kapsamı | ❌ **eksik** | Kod 106 benzersiz env okuyor, örnek dosya **39** tanımlıyor |
| Şifreleme anahtarları | ✅ production'da zorunlu | licence/defect foto, tacho kimlik bilgisi |
| CORS / auth | ✅ | production'da `CORS_ORIGIN` zorunlu |
| Migration | ✅ dev'de güncel | production'a uygulanma **doğrulanmadı** |
| Yedekleme | ⚠️ script var | `scripts/backup-daily.sh`; cron kurulumu doğrulanmadı |
| **Restore** | ❌ **script yok, hiç denenmedi** | `scripts/` altında restore yok |
| Health | ✅ | `/health`, `/health/ready` |
| Monitoring / logging | ⚠️ | Sentry bootstrap var; production'da aktif olduğu doğrulanmadı |
| E-posta / davet | ❌ doğrulanmadı | SPF/DKIM/DMARC ve gerçek teslim testi yok |
| Retention | ✅ | `retention.job.ts`, 03:00 Europe/Berlin, varsayılan açık |
| Kiracı izolasyonu | ✅ (bir istisnayla) | bkz. §11 |

---

## 13. Bilinen Sınırlamalar

- Telematik hattı **gerçek donanımla** hiç çalıştırılmadı; yalnızca codec8 simülatörüyle.
- Takograf zinciri gerçek DDD dosyasıyla hiç çalıştırılmadı; yalnızca sentetik aktiviteyle.
- Bordro ihracatı yapılandırılmamış (0 sürücü profili, 0 tenant profili) ve Lexware yazıcısı
  gerçek örnek dosya beklediği için yok. **Pilotun günlük akışını engellemez.**
- Yük/eşzamanlılık davranışı ölçülmedi.
- Sidebar otomatik kaydırma düzeltmesinin gezinti yolu bu ortamda doğrulanamadı
  (`behavior:'smooth'` otomasyon tarayıcısında etkisiz).

---

## 14. Ertelenen Faz-2 Kalemleri

Kayıt için; bu pilotta **iş üretmezler**: Schichtmodell/WorkSchedule (`countsTowardTarget`
içindeki Mo–Fr varsayımı), fiziksel zaman terminali, GPS makullük denetimi, OR-Tools
genişletmesi, yeni sektör uyarlamaları, DATEV bordro yazıcısı, Lexware bordro yazıcısı (gerçek
ASCII örnek dosyası bekliyor), yeni muhasebe özellikleri, mobil uygulama mağaza dağıtımı,
şema drift temizliği (6 satır, pilot dışı tablolar).

---

## 15. Güncel Riskler

| # | Risk | Olasılık | Etki | Sınıf |
|---|---|---|---|---|
| R1 | Sürücüler giriş yapamaz (44/45 hesapsız) | Kesin | Pilot başlamaz | P0 |
| R2 | **Gerçek** cihaz yok → tam gün telemetri, gerçek takograf/DDD doğrulanmamış (simülatör hattı çalışıyor) | Kesin | Başarı ölçütü ölçülemez | P0 |
| R3 | Filoda 1 araç → gerçek gün simüle edilemez | Kesin | Pilot temsili değil | P0 |
| ~~R4~~ | ~~`BreakCandidate` izolasyon kanıtı yok~~ — **denetimde kapatıldı** | — | — | ✅ |
| R5 | Pilot verisi QA artıklarıyla aynı DB'de | Orta | Veri karışması, yanlış rapor | P0 |
| R6 | Restore hiç denenmedi | Orta | Veri kaybı kalıcı olur | P0 |
| R7 | `.env.production.example` 106'nın 39'unu kapsıyor | Yüksek | Yanlış yapılandırmayla açılış | P0 |
| R8 | Sürücülerde geçerli ehliyet kontrolü yok | Kesin | Her işte Halterhaftung onayı; kontrol anlamsızlaşır | P0 |
| R9 | E-posta teslimi doğrulanmadı (davet, hatırlatma, fatura) | Orta | Sürücü onboarding kırılır | P1 |
| R10 | IMEI→araç eşleştirme UI'ı yok | Yüksek | Cihaz kurulumu elle/DB üzerinden | P1 |
| R11 | Production'da monitoring aktif değil | Orta | Arıza geç fark edilir | P1 |
| R12 | Bordro profilleri boş | Yüksek | Ay sonu ihracatı yapılamaz (pilot günü etkilemez) | P1 |

---

## 16. Azaltıcı Önlemler

- **R1/R3/R8:** Pilot şirketten gerçek sürücü/araç listesi alınır; `import` modülü veya
  hedefe özel bir provisioning scripti ile tek seferde yüklenir; her sürücüye davet e-postası;
  ehliyet kontrolleri girilir. (Gün 3–5)
- **R2/R10:** Cihaz tedariki **1. gün** başlatılır. Eşleştirme UI'ı yoksa geçici olarak
  `devices` ucu üzerinden yapılır ve bu, pilot çalışma talimatına yazılır. (Gün 1–12)
- ~~**R4**~~ — denetim sırasında yapıldı; ek iş yok.
- **R5:** Pilot için **ayrı kiracı** açılır; QA kiracıları ve `qa-crud-*` kullanıcıları
  temizlenir veya pilot veritabanından tamamen ayrılır. (Gün 3–5)
- **R6:** `restore-verify.sh` yazılır, boş bir veritabanına gerçek yedek geri yüklenir ve
  satır sayıları karşılaştırılır. (Gün 13–15)
- **R7:** Kodun okuduğu 106 env taranıp `.env.production.example` tamamlanır; production
  açılışı sahte değerlerle prova edilir. (Gün 13–15)
- **R9/R11:** DNS/SPF/DKIM/DMARC doğrulanır, gerçek davet e-postası gönderilir; Sentry ve
  `/health` izlemeye bağlanır. (Gün 13–15)
- **R12:** Pilot bordro hedefi Lexware seçilir, sürücü profilleri ve Lohnart eşlemeleri
  girilir; yazıcı beklerken nötr CSV ile prova edilir. (Gün 16–17, pilotu bloklamaz)

---

## 17. GO / NO-GO Ölçütleri

Her ölçüt **ölçülebilir** ve kanıt dosyasına bağlanabilir olmalıdır.

**Zorunlu (hepsi yeşil olmadan GO yok):**

1. **Kiracı sızıntısı yok** — `tenant-isolation-check.ts` yeşil **ve** `BreakCandidate` dahil
   tüm kiracı kapsamlı modeller kapsamda.
2. **Batarya tam yeşil** — tsc + `npm test` + codec8-sim + `verify-tacho-telematics` +
   izolasyon kontrolü, hepsi tek oturumda.
3. **Gerçek sürücü tam vardiya tamamlıyor** — giriş → kalkış kontrolü → mesai başlat → en az
   bir mola → mesai bitir; Zeiterfassung dakikaları elle hesapla ±1 dk uyumlu.
4. **Ofis günlük operasyonu** — en az 5 gerçek iş oluşturuluyor, atanıyor, güncelleniyor,
   biri iptal ediliyor; sürücü tarafında doğru görünüyor.
5. **Telemetri bir tam iş günü hayatta kalıyor** — en az 1 gerçek araçta ≥8 saat kesintisiz
   ingest; trip başlangıç/bitiş doğru; canlı konum ofiste görünüyor.
6. **Mola/çalışma süresi verisi doğru** — takograf REST'inden üretilen aday, gerçek DDD
   dosyasından geliyor ve onaylandığında PayrollDay dakikaları tutuyor.
7. **Yedek + restore doğrulandı** — gerçek yedek boş bir veritabanına geri yüklendi, kritik
   tabloların satır sayıları eşleşti.
8. **Production yapılandırması doğrulandı** — `.env.production.example` kodun okuduğu tüm
   zorunlu değişkenleri kapsıyor; uygulama production modunda eksik anahtarla **açılmıyor**.
9. **Kritik güvenlik/denetim bulguları kapalı** — bu rapordaki P0'ların tamamı.
10. **Pilot verisi izole** — pilot kiracısında QA/demo artığı yok; `driver.userId` eşlemesi
    pilot sürücülerinin %100'ünde dolu.

**Uyarı eşiği (GO'yu engellemez, yazılı kabul gerektirir):** P1 kalemlerin herhangi biri açık
kalırsa, pilot sırasında hangi manuel telafinin uygulanacağı yazılı olmalıdır.

---

## 18. Nihai Pilot Tavsiyesi

**Bugün: NO-GO.**

Gerekçe tek bir cümlede: ürün çalışıyor ama pilot şirketi sisteme **henüz girmedi** — sürücüler
giriş yapamıyor, filo kayıtlı değil, tek bir telematik cihaz bile bağlı değil ve bu yüzden
başarı ölçütünün ("bir tam iş günü") ölçülmüş hiçbir kanıtı yok.

Yazılım tarafında bulunan tek gerçek kusur küçük ve kapatılabilir (P0-4, izolasyon kapsamı).
Geri kalan engellerin tamamı provisioning, donanım ve üretim yapılandırmasıdır.

**Tavsiye:** 20 günlük plan, kritik yol **cihaz tedariki ve veri provisioning** olacak şekilde
uygulanır (bkz. `PILOT-20-DAY-PLAN.md`). 20. günde §17'deki 10 ölçüt tek tek kanıtla
işaretlenir. 10/10 değilse pilot ertelenir; kısmi GO **önerilmez**, çünkü ölçütlerin hiçbiri
"kısmen doğru" olabilecek türden değildir.
