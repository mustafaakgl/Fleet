# Faz A Promptları (kısa sürüm) — sırayla, biri bitmeden diğerine geçme

CLAUDE.md kuralları zaten geçerli; promptlar bilerek kısa.

---

## T1 — DDD kuyruğu

```
DDD işlemeyi kuyruğa taşı: /tachograph/ddd/upload şu an ingestDddFile()'ı senkron çağırıyor.
telemetry-queue.service.ts desenini kopyalayarak TachographQueueModule yap.
Upload: dosya kaydet + DddFile status=pending + enqueue + 202 dön.
Consumer: parse→imza→kurallar→persist; başarıda processed, hatada failed (+kısa hata özeti), max 3 retry.
ddd-archive sayfasına status kolonu ekle.
Test: sadece consumer'ın mutlu yolu + failed yolu. Fazlasına girme.
```

## T2 — TIS-Web uzaktan DDD indirme

```
tachoDownloadSchedule kayıtları için uzaktan DDD indirme kur.
DddRemoteDownloadPort arayüzü + TisWebAdapter (tenant başına credential, şifreli sakla) +
MockRemoteAdapter (test için).
Repeatable job: vadesi gelen schedule'ları tara → dosyaları indir → SHA-256 mükerrer kontrolü →
T1 kuyruğuna ver → nextDueAt güncelle. Hatada lastError yaz, cron'u öldürme.
ddd-archive'a "kaynak" (manuel/uzaktan) kolonu.
Test: mock adaptörle uçtan uca tek test yeter.
```

## T3 — İhlal eskalasyonu

```
TachoInfringement oluşunca bildirim gitmiyor, ekle: minor/major → office+boss,
critical → +sürücü. Yeni notification type: tacho_infringement (i18n de/en/tr).
7 gün acknowledge edilmeyene günlük cron ile hatırlatma (reminders'daki due→overdue desenini kullan).
TachoInfringement'a payrollRelevant alanı + PATCH /infringements/:id/payroll-flag
(@Roles accounting/boss/admin).
Infringements sayfasına: acknowledge durumu + payroll toggle.
Test: bildirim hedefleri + payroll-flag yetkisi, bu kadar.
```

## T4 — Sürüş olayı bildirimleri

```
fleetDrivingEvent olaylarını (speeding/harsh_brake/harsh_accel/crash) bildirime bağla.
telematics-alarm.service.ts'deki bastırma desenini kullan: aynı sürücü+tip için 30 dk tek bildirim.
crash her zaman bildirilir (office+boss), diğerleri eşik üstünde (office).
Yeni type: driving_event, i18n de/en/tr.
Test: bastırma + crash istisnası. codec8-sim --scenario harsh-driving ile elle doğrula.
```

## T5 — Cihaz eşleştirme

```
Devices modülüne pair/unpair ekle: POST /devices/:id/pair (bir araçta tek aktif cihaz,
çakışmayı reddet) ve /unpair. @Roles admin/office.
GET /devices'a lastSeenAt'ten türeyen status ekle: online <5dk / stale <24sa / offline.
Bilinmeyen IMEI gateway'e bağlanırsa quarantine'e düşür.
Frontend: cihaz listesine status rozeti + pair/unpair diyaloğu (mevcut liste desenini kullan).
Test: pair çakışması + status türetme sınırları.
```

## T6 — Tako↔GPS iş günü timeline

```
TachoGpsFusionService: sürücü+gün için TachoActivity + DriverLocationHistory'yi birleştir,
segment listesi üret (tachoState, gpsDurum: moving/stationary/no_data, avgSpeed).
Tutarsızlık işareti: rest iken hız >10 km/h veya driving iken 30+ dk sabit. Yeni model AÇMA,
on-the-fly hesapla.
Endpoint: GET /tachograph/drivers/:id/workday?date=... (driver sadece kendini görür).
Sürücü story sayfasına renk kodlu timeline barı ekle.
Test: birleştirme + bir tutarsızlık senaryosu, yeter.
```

## T7 — Quarantine uçtan uca

```
TelemetryQuarantine akışını tamamla: CRC hatası, malformed frame, bilinmeyen IMEI, consumer
parse hatası — dördü de reason alanıyla quarantine'e düşsün (düşmeyeni bağla).
GET /telematics/quarantine (sayfalı) + POST .../:id/reprocess (kuyruğa geri ver) +
PATCH status=dismissed. Silme endpoint'i YAZMA.
Basit admin liste sayfası: reason rozeti + reprocess butonu.
Test: reprocess → ProcessedRecord oluşuyor mu, tek test.
```

---

Her görev sonunda: batarya + `faz-a: <görev>` commit + loop_journal satırı.
