# Kanit — Yakit analitigi ERP metrikleri (kaldirma + 3 yeni metrik)

Tarih: 2026-07-30
Kapsam: `/fleet-analytics/fuel` kokpiti + backend cockpit servisi

## Kullanici karari (soru-cevap)

1. "1., 2., 3. adim" = **A secenegi**: yakit metrik tablosunun ilk 3 satiri
   1. EUR/100 km ve EUR/km
   2. Litre fiyati vs. donem ortalamasi
   3. Hedef tuketim (arac normu) vs. gercek sapma
2. Silme kapsami = **"Delta kalksin, GPS tahmini kalsin"** (madde 2, 4, 5)

## Kaldirilanlar

| Blok | Durum |
| --- | --- |
| KPI karti "Tahmin − fis farki" (`totals.estimatedVsRealDeltaLiters`) | kaldirildi |
| "Arac karsilastirmasi" bar grafigi (`deltaPercent` + `suspiciousEventCount`) | kaldirildi, yerine "Hedef tuketim sapmasi" grafigi |
| Surucu kirilimi kolonlari "Tahmini L/100" ve "Tahmin − fis farki" | kaldirildi |

Korunanlar (kullanici istegi): KPI karti "Tahmini litre (GPS)", haftalik trendteki yesil
"Tahmini L/100" cizgisi, "Supheli olaylar" karti. Backend `deltaLiters`/`deltaPercent`
alanlari supheli olay uretimi icin yerinde birakildi, sadece UI kullanimi kaldirildi.

## Eklenenler

### 1. EUR/100 km ve EUR/km
- `totals.realDistanceKm`, `totals.costPerKm`, `totals.costPer100Km`
- Mesafe kaynagi: odometre bazli interval mesafesi (`analytics.totalDistanceKm`), 0 ise GPS `tripDistanceKm`
- Arac satirinda: `realDistanceKm`, `costPerKm`, `costPer100Km`
- Surucu satirinda: `realCost`, `costPer100Km` (yeni; `buildDriverFuelBreakdown` artik fis tutarini da topluyor)
- Haftalik trendte: `realCost`, `costPer100Km`
- UI: "Km maliyeti" KPI karti (deger EUR/100 km, alt satir EUR/km) + surucu tablosunda
  "EUR/100 km" ve "Yakit harcamasi" kolonlari

### 2. Litre fiyati vs. donem ortalamasi
- `totals.averagePricePerLiter` 3 haneye cikarildi, `minPricePerLiter` / `maxPricePerLiter` eklendi
- `totals.aboveAveragePriceEntryCount`, `totals.aboveAverageExcessCost`
- Yeni `priceOutliers[]`: donem ortalamasini `%FUEL_PRICE_TOLERANCE_PERCENT` (5) asan fisler;
  `pricePerLiter`, `deviationPercent`, `excessCost` (= (fiyat − ortalama) × litre), fazla maliyete gore sirali
- Haftalik trendte `averagePricePerLiter` (fis bazli, interval bazli degil)
- UI: "Ortalama litre fiyati" KPI karti (alt satir min–max), "Pahali tanklama" KPI karti
  (adet + toplam fazla maliyet) ve tam genislikte "Ortalama ustu tanklamalar" tablosu
  (fis detayina tiklanabilir)

### 3. Hedef tuketim vs. gercek sapma
- Mevcut ama kullanilmayan `Vehicle.avgConsumptionLPer100Km` alani devreye alindi
  (yoksa `FLEET_TRIP_PROCESSING_CONFIG.defaultAvgConsumptionLPer100Km`)
- Arac satirinda `targetLitersPer100Km`, `targetDeviationPercent`
- `totals.overTargetVehicleCount` (esik `%FUEL_TARGET_TOLERANCE_PERCENT` = 10),
  `totals.ratedVehicleCount`, `totals.averageTargetDeviationPercent`
- UI: "Hedef ustu arac" KPI karti (n / m + ort. sapma) ve "Hedef tuketim sapmasi"
  bar grafigi (hedef L/100 vs. gercek L/100, tooltip'te sapma yuzdesi, en kotu 8 arac)

## KPI kart duzeni (6 → 8, `lg:grid-cols-4`)

Gercek litre (fis) · Tahmini litre (GPS) · Yakit maliyeti · Km maliyeti ·
Ortalama litre fiyati · Pahali tanklama · Hedef ustu arac · CO2 tahmini
(her kartta ikincil ipucu satiri eklendi)

## Dokunulan dosyalar

- `backend/src/fleet/core/fleet-fuel-analytics.util.ts` — `WeeklyFuelTrendPoint` ve
  `DriverFuelBreakdown` maliyet/fiyat alanlariyla genisletildi, `buildWeeklyFuelTrend`
  ucuncu parametre olarak fis satirlarini aliyor
- `backend/src/fleet/core/fleet-fuel-estimation.util.spec.ts` — yeni imzalar + yeni alan assertion'lari
- `backend/src/fleet/fleet-fuel.service.ts` — `FUEL_PRICE_TOLERANCE_PERCENT`,
  `FUEL_TARGET_TOLERANCE_PERCENT`, yeni tipler (`FleetFuelPriceOutlier`), cockpit hesaplamasi
- `frontend/lib/types.ts` — `FleetFuelAnalyticsCockpitResponse` sozlesmesi guncellendi
- `frontend/app/(dashboard)/fleet-analytics/fuel/page.tsx` — kart/grafik/tablo yeniden duzeni
- `frontend/src/locales/{de,en,tr}/common.json` — 18 yeni anahtar; ayrica Almanca metinlerdeki
  "Sefer-km" / "Seferdaten" kalintilari "Fahrt-km" / "Fahrtdaten" olarak duzeltildi

Yeni Prisma modeli yok, migration yok.

## Dogrulama

```
backend $ npx tsc -p tsconfig.json --noEmit          -> TSC_OK
backend $ npm test                                    -> tests 358 / pass 358 / fail 0 (79 spec)
backend $ npx ts-node --transpile-only scripts/tenant-isolation-check.ts
                                                      -> Tenant isolation check passed.
frontend $ npx eslint "app/(dashboard)/fleet-analytics/fuel/page.tsx" lib/types.ts
                                                      -> LINT_OK (0 error)
frontend $ npm run verify                             -> i18n-check + tsc --noEmit + next build yesil
```
