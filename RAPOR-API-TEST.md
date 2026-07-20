# Fleet API — Canlı Endpoint Test Raporu

**Tarih:** 2026-07-20 · **Ortam:** localhost:3000 (dev) · **Yöntem:** Swagger OpenAPI spec'i (`/api/docs-json`) üzerinden otomatik canlı istekler (tarayıcı içi fetch, Claude in Chrome)
**Kimlikler:** admin@fleet.com (admin), driver@fleet.com (driver), dhl.customer@fleet.com (customer), boss@fleet.com (boss) — seed hesapları

## Özet

Spec'te tanımlı **383 endpoint**'in tamamı hedeflendi; rol varyantlarıyla birlikte toplam **510 istek** çalıştırıldı.

| Sonuç | Adet | Açıklama |
|---|---|---|
| 2xx (başarılı) | 285 | Beklenen davranış |
| 400 (validasyon) | 69 | Çoğu jenerik test gövdesine beklenen validasyon cevabı ✔ — ancak 19'u "maskelenmiş" hata (aşağıda) |
| 401 | 2 | MFA endpoint'leri, geçersiz kodla beklenen cevap ✔ |
| 403 | 74 | Rol koruması çalışıyor ✔ (driver/customer/fleet-ops ayrımı) |
| 404 | 49 | Tenant-scoped ID izolasyonu + var olmayan kayıt testleri ✔ |
| **5xx** | **6** | **3'ü gerçek bug (aşağıda), 2'si eksik konfig (beklenen), 1'i SSO kapalı (beklenen)** |
| Atlandı | 25 | SSE stream/export (5), politika gereği skip: auth mutasyonları, billing, import, privacy-erase (17+3) |

## 🔴 Bulunan Gerçek Buglar

### 1. Body'siz POST → 500 TypeError (unhandled exception)
```
POST /api/v1/company-emails/generate        (body yok)  → 500 {"error":"TypeError"}
POST /api/v1/driver/work-sessions/end       (body yok)  → 500 {"error":"TypeError"}
```
Controller, `req.body` alanlarına guard'sız erişiyor. Body `{}` gönderilince 400/200 dönüyor, hiç body gönderilmeyince 500. Beklenen: 400 Bad Request. (`ValidationPipe` öncesi DTO'suz erişim ya da `@Body()` opsiyonel değil.)

### 2. `POST /api/v1/company-emails/generate` — geçerli tarihle bile 500
```
Body: {"date":"2026-07-20"} → 500 {"error":"PrismaClientValidationError"}
Body: {}                    → 400 "Invalid date"
```
Prisma sorgusuna hatalı/eksik argüman gidiyor; `generate-for-date` de aynı davranışta. Servis katmanında date parse + Prisma create argümanları kontrol edilmeli.

### 3. Maskelenmiş iç hatalar: 400 "An unexpected error occurred" (19 endpoint)
Bu endpoint'ler validasyon hatası yerine iç istisnayı yakalayıp jenerik 400'e çeviriyor — gerçek sebep (muhtemelen TypeError/Prisma hatası) kayboluyor, istemci anlamlı mesaj alamıyor:
`GET /telematics/vehicle-health/{vehicleId}/series` · `POST /assignments` · `POST /assignments/{id}/transition` · `POST /transport-requests` · `POST /reminders/service` · `POST /reminders/vehicle` · `POST /reminders/vehicle/bulk` · `POST /driver/me/push-token` · `POST /driver/work-sessions/end` · `POST /driver/vehicle-handovers/{id}/photo` · `POST /driver/transport-requests` · `POST /privacy/delete/driver/{id}` · `POST /privacy/delete/user/{id}` · `POST /checklist-templates` · `POST /driver/fleet/trips/{id}/locations` · `POST /devices` · `POST /messenger/conversations/{id}/messages` · `POST /company-emails/generate*` (2)

Özellikle `GET .../vehicle-health/{vehicleId}/series` geçerli bir vehicleId ile bile bu hatayı veriyor — read-only bir endpoint'te bu büyük olasılıkla gerçek bir bug.

## 🟡 Dikkat / Beklenen Ama Not Edilen

- `POST /tracking/telematics/telemetry` → 503 "DEVICE_INGEST_TOKEN is not configured" (dev'de beklenen)
- `POST /tachograph/ddd/upload/service` → 503 "TACHO_INGEST_TOKEN is not configured" (dev'de beklenen)
- `GET /auth/oidc/login` → 503 "SSO is not enabled" (beklenen)
- `Fleet operations` (fleet-ops/tenants): hiçbir seed kullanıcıda `fleet_ops` yetkisi yok (admin dahil) → bu 5 endpoint fonksiyonel olarak test edilemedi (403 koruması doğrulandı).
- SSE/stream endpoint'leri (`/notifications/stream`, `/tracking/live/stream`) ve export/download'lar istemli olarak atlandı.
- MFA akışı yalnızca negatif senaryoyla test edildi (geçersiz kod → 401 ✔).

## ✅ Güçlü Görünen Alanlar

- **RBAC:** admin token'ı ile driver/customer portal endpoint'leri tutarlı şekilde 403; driver/customer token'larıyla kendi endpoint'leri 200. 74 rol kontrolünün tamamı tutarlı.
- **Tenant/sahiplik izolasyonu:** driver token'ı, admin'in gördüğü kayıt ID'lerine 404 dönüyor (sızıntı yok).
- **Validasyon:** ~50 endpoint jenerik/bozuk gövdeleri anlamlı mesajlarla 400'le reddetti (class-validator mesajları düzgün).
- **Performans:** 510 istekte 2 sn üzeri yanıt yok; en yavaşlar ~180 ms (drivers listesi, dashboard).
- **Health/Metrics:** `/health`, `/metrics` 200 ✔

## Test Sırasında Değişen Veriler (dev DB)

- Oluşturulan test kayıtları: 1'er adet user, driver, vehicle (+equipment), company, document, morning-checkin, work-session, driver request ("QA Test …" adlı) — user/driver/vehicle/company/document kayıtları DELETE testleriyle yine silindi.
- ~51 aksiyon endpoint'i seed kayıtlarında durum değiştirdi (ör. bir request cancel, bir handover complete, reminder resolve/ignore, notification read).
- Temiz bir demoya dönmek için: `npm run seed` (backend).

## Kapsam Dışı Bırakılanlar (politika)

`auth/logout|change-password|password-reset|refresh` (oturumu bozmamak için), `billing/*` mutasyonları (CLAUDE.md kapsam sınırı + olası harici servis), `import/*` (dosya import'u), `privacy/erase` (kalıcı silme). GET'leri test edildi.

## Önerilen Sonraki Adımlar

1. Global exception filter'da TypeError/PrismaClientValidationError'ı 400 "unexpected" olarak maskelemek yerine loglayıp ayırt etmek; body'siz POST'lar için DTO + `ValidationPipe`'ın `whitelist/forbidNonWhitelisted` ile zorunlu kılınması.
2. `company-emails/generate*` ve `telematics/vehicle-health/{id}/series` servislerinin ayıklanması (2 gerçek 500 + 1 şüpheli maskelenmiş hata).
3. Maskelenmiş 19 endpoint için gerçek validasyon mesajlarının ortaya çıkarılması.
4. Seed'e `fleet_ops: true` bir kullanıcı eklenmesi (fleet-ops endpoint'leri hiç test edilemiyor).
