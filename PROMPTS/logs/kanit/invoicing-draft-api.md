# Invoicing Draft API Kaniti

Tarih: 2026-07-27

## Kapsam

- `GET/PUT /api/v1/invoicing/billing-profile`
- `GET /api/v1/invoicing/uninvoiced?from=&to=`: tamamlanmis ve kesinlesmis fatura claim'i olmayan atamalari sirket bazinda gruplar.
- `POST /api/v1/invoicing/invoices`: tek sirkete ait tamamlanmis atamalardan ve/veya manuel satirlardan taslak olusturur.
- `GET /api/v1/invoicing/invoices`: durum, sirket ve tarih filtreli liste.
- `GET /api/v1/invoicing/invoices/:id`: satir, odeme, teslimat, ihtar ve audit detaylari.
- `PATCH /api/v1/invoicing/invoices/:id`: yalniz `draft` durumunda tarih, hizmet donemi, vade ve not guncellemesi.
- Finansal rol guard'i ve tum mutasyonlarda `@RequiresWrite()` kullanildi.
- Fiyat kaynagi: once atama `expectedDailyRevenue`, sonra sirket `defaultDailyRevenue`; ikisi de yoksa taslak reddedilir.
- Taslak olusturma invoice audit event ve genel audit kaydi uretir.

## Davranis Testleri

Yeni `invoicing.service.spec.ts` kontrolleri:

1. Farkli sirkete ait atama reddedilir.
2. Atama ve sirket fiyati olmayan kayit reddedilir.
3. `draft` disina cikmis fatura degistirilemez.
4. Gecersiz fatura numara formati DB yazimindan once reddedilir.

## Dogrulama

- `npx tsc -p tsconfig.json --noEmit`: PASS
- `npm test`: PASS, 69 spec dosyasi, 253/253 test
- `node scripts/seed-tacho-demo.mjs`: PASS, bugunun atamasi mevcut
- `node scripts/codec8-sim.mjs --scenario normal --seed 42 | node scripts/verify-tacho-telematics.mjs`: PASS, 5/5 kontrol
- `npx ts-node scripts/tenant-isolation-check.ts`: PASS; 12 invoicing modeli tenant A/B kapsaminda
- `git diff --check`: PASS

Not: `verify-tacho-telematics.mjs` sim ozeti JSON'unu stdin'den bekledigi icin simulator ile pipe edilerek calistirildi.
