# Fleet Bug Inventory

Date: 2026-07-20

Only reproduced defects are listed. Candidates remain in test notes until confirmed.

| ID | Modül | Test türü | Severity | Durum | Tekrar üretme | Kök neden | Düzeltme | Regresyon testi | Kanıt |
|---|---|---|---|---|---|---|---|---|---|
| QA-001 | Telematics tooling | Integration | Low | FIXED | Gateway kapalıyken Codec8 sim çalıştır; mesajdaki `start:dev` komutu sonrası `:5027` kapalı kalır | REST ve standalone TCP gateway farklı entrypoint; hata mesajı yanlış scripti öneriyordu | `start:gateway` npm scripti ve iki CLI mesajı eklendi | `gateway-cli-guidance.spec.ts` 3/3 PASS | İlk koşu `ECONNREFUSED :5027`; standalone gateway sonrası telematik 5/5 PASS |
| QA-002 | Frontend tooling | Lint/build | Medium | FIXED | `npm run verify` sonrası `npm run lint` | ESLint `.next/**` ignore ederken izole build dizini `.next-verify/**` kapsam dışıydı | `.next-verify/**` global ignore eklendi | Tam `npm run lint` PASS | Önce 40.526 bulgu/9.722 error; sonra 0 error, 21 warning |
| QA-003 | Equipment issuance | API/E2E/security | High | FIXED | `%PDF` başlıklı bozuk dosyayla issuance oluştur, driver sign çağır | Upload yalnız MIME kontrolü yapıyor; bozuk PDF create'te kabul edilip `pdf-lib` sayfa erişiminde 500 oluyordu | Create/manual upload yapısal PDF doğrulaması, fail-closed 400 ve geçersiz dosya cleanup | Service 4/4 PASS; focused E2E 7/7; final E2E 20/20 | İlk E2E imza response 500 `PDFDocument.computePages`; final lifecycle PASS |
| QA-004 | E2E service reminders | E2E test | Low | FIXED | Boş reminders sayfasında iki aynı isimli CTA varken strict role selector kullan | Test locator iki geçerli butonla eşleşiyordu | Görünür ilk CTA açıkça seçildi | Focused E2E ve final 20/20 PASS | İlk koşu strict-mode violation; tekrar koşu PASS |

## Severity

- Critical: authentication bypass, cross-tenant write/read, secret exposure or destructive integrity loss.
- High: authorization bypass, critical workflow corruption or broadly unavailable core flow.
- Medium: bounded incorrect behavior with a practical workaround.
- Low: minor usability, validation or observability defect.
