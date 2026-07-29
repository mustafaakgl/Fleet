# Invoicing Mock Seed + Summary Endpoint Kaniti

Tarih: 2026-07-28

## Yapilanlar

- Yeni script: `npm run seed:invoicing-mock`
- Yeni endpoint: `GET /api/v1/invoicing/invoices/summary/by-company`
  - Query: `groupBy=day|week`
  - Opsiyonel: `from`, `to`, `status`
- Mock veriler idempotent uretildi:
  - Tenant billing profile
  - 4 sirkete ait mock completed assignment'lar
  - 8 adet fatura (sent/paid)
  - Invoice line -> assignment claim baglari
  - Paid faturalar icin odeme kaydi

## Seed Ciktisi Ozeti

- `tenantId`: `default-tenant`
- `actor`: `boss@fleet.com`
- `invoicesCreated`: `8`
- Ornek numaralar: `MOCK-2026-0101`, `MOCK-2026-0102`, `MOCK-2026-0201`...

## Dogrulama Komutlari

- `npx tsc -p tsconfig.json --noEmit` -> PASS
- `npm test` -> PASS (`253/253`)
- `npm run seed:invoicing-mock` -> PASS
- `node scripts/seed-tacho-demo.mjs` -> PASS
- `node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs` -> PASS (5/5)
- `npx ts-node scripts/tenant-isolation-check.ts` -> PASS

## Goruntuleme Uclari

- Fatura listesi: `/api/v1/invoicing/invoices`
- Sirket bazli gunluk toplama: `/api/v1/invoicing/invoices/summary/by-company?groupBy=day`
- Sirket bazli haftalik toplama: `/api/v1/invoicing/invoices/summary/by-company?groupBy=week`
- Sirkete gore filtreli liste ornegi: `/api/v1/invoicing/invoices?companyId=<COMPANY_ID>&from=2026-07-21&to=2026-08-02`
