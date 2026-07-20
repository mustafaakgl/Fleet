# Fleet Bug Inventory

Date: 2026-07-20

Only reproduced defects are listed. Candidates remain in test notes until confirmed.

| ID | Modül | Test türü | Severity | Durum | Tekrar üretme | Kök neden | Düzeltme | Regresyon testi | Kanıt |
|---|---|---|---|---|---|---|---|---|---|
| QA-001 | Telematics tooling | Integration | Low | FIXED | Gateway kapalıyken Codec8 sim çalıştır; mesajdaki `start:dev` komutu sonrası `:5027` kapalı kalır | REST ve standalone TCP gateway farklı entrypoint; hata mesajı yanlış scripti öneriyordu | `start:gateway` npm scripti ve iki CLI mesajı eklendi | `gateway-cli-guidance.spec.ts` 3/3 PASS | İlk koşu `ECONNREFUSED :5027`; standalone gateway sonrası telematik 5/5 PASS |
| QA-002 | Frontend tooling | Lint/build | Medium | FIXED | `npm run verify` sonrası `npm run lint` | ESLint `.next/**` ignore ederken izole build dizini `.next-verify/**` kapsam dışıydı | `.next-verify/**` global ignore eklendi | Tam `npm run lint` PASS | Önce 40.526 bulgu/9.722 error; sonra 0 error, 21 warning |
| QA-003 | Equipment issuance | API/E2E/security | High | FIXED | `%PDF` başlıklı bozuk dosyayla issuance oluştur, driver sign çağır | Upload yalnız MIME kontrolü yapıyor; bozuk PDF create'te kabul edilip `pdf-lib` sayfa erişiminde 500 oluyordu | Create/manual upload yapısal PDF doğrulaması, fail-closed 400 ve geçersiz dosya cleanup | Service 4/4 PASS; focused E2E 7/7; final E2E 20/20 | İlk E2E imza response 500 `PDFDocument.computePages`; final lifecycle PASS |
| QA-004 | E2E service reminders | E2E test | Low | FIXED | Boş reminders sayfasında iki aynı isimli CTA varken strict role selector kullan | Test locator iki geçerli butonla eşleşiyordu | Görünür ilk CTA açıkça seçildi | Focused E2E ve final 20/20 PASS | İlk koşu strict-mode violation; tekrar koşu PASS |
| QA-005 | Auth refresh | API/security | High | FIXED | Döndürülmüş eski body refresh token'ı tekrar kullan, sonra replacement token'ı dene | Reuse yalnız sunulan token'ı revoke ediyor, aktif replacement zincirini açık bırakıyordu | Kullanıcının tüm aktif refresh token'ları reuse anında revoke edildi | Auth unit 1/1; P0 auth API 6/6 | Replacement token reuse sonrası reddedildi |
| QA-006 | Driver create | DTO/API | Medium | FIXED | 2030 license expiry ile driver oluştur | `@Type(() => Date)` sonrası `IsDateString` ve `MinDate` aynı değerde çelişiyordu | Runtime Date doğrulaması ve string/Date input kontratı hizalandı | Boundary unit 2/2; master-data API 4/4 | Geçerli gelecek tarih önce 400, sonra create PASS |
| QA-007 | Vehicle create | API | Medium | FIXED | Aynı plate/internal code ile ikinci araç oluştur | Transaction catch Prisma P2002'yi genel 500'e çeviriyordu | P2002, 409 Conflict'e eşlendi | Mapper unit 2/2; master-data API 4/4 | Duplicate önce 500, sonra 409 |
| QA-008 | Request approval | API/security | High | FIXED | Office token ile body'de admin `currentUserId` göndererek request approve et | Approver kimliği JWT yerine istemci body alanından alınıyordu | Approver yalnız authenticated actor ID'sinden türetiliyor | Workflow API 4/4 | Spoof payload'a rağmen `approvedById` office user |
| QA-009 | Transport requests | API/tenant isolation | Critical | FIXED | Tenant A office token ile Tenant B driver/vehicle/company ID'leri gönder | Create ilişkileri tenant-scoped sorguyla doğrulamadan FK yazıyor ve response Tenant B PII döndürüyordu | Üç relation aynı transaction içinde scoped sorgularla doğrulandı | Workflow API 4/4; tenant isolation battery | Önce 201 + foreign PII, sonra 404 |
| QA-010 | Global error handling | API/security | Medium | FIXED | Non-production ortamda 429 veya 4xx üret ve JSON body'yi incele | Global exception filter `exception.stack` değerini client response'a ekliyordu | Stack yalnız server logger'da bırakıldı, response alanı kaldırıldı | Filter unit 1/1; audit/privacy API 2/2 | Önce absolute local path ve node_modules stack'i, sonra alan yok |
| QA-011 | Documents | API/privacy | High | FIXED | Office token ile salary/medical/private belgeyi listele veya direct-ID download et | Operational rol kısa devresi belge hassasiyetini ayırmadan office erişimine izin veriyordu | Üç hassas tip office list/detail/expiring/download katmanlarında fail-closed gizlendi | Privacy unit 2/2; document API 3/3 | Önce office 200, sonra listede yok ve direct-ID 404 |
| QA-012 | Assignments | API/concurrency | High | FIXED | Aynı driver/vehicle/time payload'ını iki eşzamanlı request ile oluştur | Serializable transaction duplicate'ı engelliyor ancak Prisma P2034 ikinci istekte 500'e çıkıyordu | P2034 kontrollü 409 Conflict'e eşlendi | Mapper unit 2/2; true-race workflow API 4/4 | Yarışta tam bir 201 ve bir 409 |

## Severity

- Critical: authentication bypass, cross-tenant write/read, secret exposure or destructive integrity loss.
- High: authorization bypass, critical workflow corruption or broadly unavailable core flow.
- Medium: bounded incorrect behavior with a practical workaround.
- Low: minor usability, validation or observability defect.
