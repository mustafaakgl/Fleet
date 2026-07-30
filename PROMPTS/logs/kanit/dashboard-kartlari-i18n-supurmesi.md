# Kanıt: Dashboard invoicing kartları ve i18n süpürmesi

## Kapsam
- Ana dashboard finansal rol yüzeylerine iki kart bağlandı:
  - `Faturalanmamış tamamlanan iş` → `/invoicing?tab=uninvoiced`
  - `Vadesi geçmiş faturalar` → `/invoicing?tab=overdue`
- Kartlar mevcut dashboard kart desenini kullanıyor ve yalnızca finansal rollerde render ediliyor:
  - `boss` ve `admin` için `BossTrendDashboard` içinde
  - `accounting` için `AccountingDashboard` içinde
- `/invoicing` sayfası artık `?tab=uninvoiced|overdue|drafts|open|paid` deep-link parametresini okuyor.

## i18n süpürmesi
- `dashboard.v3.invoicing.*` anahtarları de/en/tr üçlüsüne eklendi.
- `frontend/scripts/i18n-check.mjs` genişletildi:
  - de/en/tr locale namespace key-set eşitliği devam ediyor
  - `common.json` içindeki tüm `invoicing.*` anahtarları için `missing/empty` kontrolü artık hata üretiyor
- `frontend/package.json` içine `npm run verify:invoicing-i18n` eklendi.

## Doğrulama

### frontend
```bash
npm run verify:invoicing-i18n
# i18n-check passed

npx eslint components/dashboard/InvoicingSummaryCards.tsx \
  components/dashboard/BossTrendDashboard.tsx \
  components/dashboard/AccountingDashboard.tsx \
  'app/(dashboard)/invoicing/page.tsx'
# temiz

npx tsc --noEmit
# temiz

npm run lint
# 0 error, 25 mevcut warning

npm run verify
# i18n-check passed
# tsc --noEmit temiz
# next build başarılı
```

### backend
```bash
npx tsc -p tsconfig.json --noEmit
# temiz

npm test
# tests 358 / pass 358 / fail 0

node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs
# ok: true

npx ts-node scripts/tenant-isolation-check.ts
# Tenant isolation check passed.
```

## Not
- İlk batarya denemesinde `codec8-sim` gateway kapalı olduğu için `ECONNREFUSED 127.0.0.1:5027` verdi; `npm --prefix backend run start:gateway` ile yerel gateway ayağa kaldırılıp telematik adımı tekrar başarıyla tamamlandı.