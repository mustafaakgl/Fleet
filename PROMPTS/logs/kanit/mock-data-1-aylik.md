# Kanıt — 1 aylık mock veri (demo ayı)

Tarih: 2026-07-30
Görev: "mock data ile tüm siteyi son 1 aylık doldur. tüm sürücülerin ehliyet bilgileri vs de dolu olsun ki atama yapmış ol."

## Ne yapıldı

Yeni seed scripti: `backend/scripts/seed-demo-month.mjs`
npm scriptleri (`backend/package.json`):

- `npm run seed:demo-month` — sadece demo ayı
- `npm run seed:demo-all` — `seed-demo-fill` + `seed-demo-month` + `seed-invoicing-mock`

### Tasarım kararları

- **Idempotent:** tüm satırlar sabit `demo-month-*` id ile yazılır; her çalışmada önceki `demo-month-*` satırları FK-güvenli sırayla silinir.
- **Çakışma temizliği:** aynı pencereyi kapsayan eski `demo-plan-*` satırları da silinir (bir güne iki plan düşmesin).
- **Tarih kuralı:** `@db.Date` ve gün işaretçisi alanlar `new Date(Date.UTC(y, m, d))` ile üretilir (repo hafızası: yerel gece yarısı Berlin'de günü bir geri kaydırıyor).
- **Pencere:** `SEED_DAYS_BACK=30` (varsayılan) geri, `SEED_DAYS_FORWARD=3` ileri. Tenant `SEED_TENANT_ID` ile değiştirilebilir (varsayılan `default-tenant`).
- **Gerçekçilik:** Pazar kapalı, Cumartesi iskelet kadro (`i % 4 === 0`), %6 organik boşluk, 3 gün bilinçli "plansız" bırakıldı, 7 izin/hastalık/eğitim kaydı takvimde günleri bloklar.
- **Durumlar:** geçmiş gün → `completed` (%5 `cancelled`), bugün → `in_progress`/`confirmed`, gelecek → `planned`/`confirmed`.

### Kapsanan modüller (10 faz)

1. Ehliyetler + ehliyet kontrolleri (süresi dolmuş / yakında dolacak / uzun vadeli karışımı, sürücü kartındaki `licenseNumber` + `licenseExpiryDate` da güncellenir)
2. İzin talepleri + takvim izin kayıtları
3. Günlük döngü: atamalar, takvim, sabah check-in, çıkış kontrolleri (+ madde sonuçları), arızalar, çalışma seansları
4. Araç devirleri
5. Nakliye talepleri
6. Servis/bakım kayıtları
7. Bußgeld (ceza) kayıtları — Almanca ihlal tipleri
8. Kaza / yük hasarı
9. Yakıt kayıtları
10. Belgeler + hatırlatmalar (sürücü `Führerschein` / araç `HU-Bericht`)

## Seed çıktısı

```
[seed-demo-month] tenant=default-tenant window=2026-06-30 … 2026-08-02
driverLicenses: 36, licenseChecks: 144, leaveRequests: 7,
assignments: 970, calendarEvents: 1004, morningCheckins: 748,
departureChecks: 704, checkItemResults: 4928, defects: 40,
workSessions: 792, vehicleHandovers: 16, transportRequests: 14,
serviceRecords: 22, fines: 8, accidents: 5, fuelEntries: 90,
documents: 48, reminders: 48
```

Ardından `seed-demo-fill.mjs` (ekipman, bakım kuralları, telematik trip/event) ve
`seed:invoicing-mock` (fatura, satır, ödeme, Mahnung, rate card) çalıştırıldı.

## Doğrulama (DB, default-tenant)

```
active drivers 48 | with license 48 | missing 0
assignments        1029
calendarEvent      1292
morningCheckin      765
departureCheck      706
workSession         810
defect               50
fine                 18
accident             21
serviceRecord        46
reminder            120
document             63
fleetFuelEntry      109
vehicleHandover      33
transportRequest     30
request              54
licenseCheck        156
invoice               8
invoiceLine          16
invoicePayment        4
fleetTrip           106
assignment window 2026-06-23 -> 2026-08-01
son 12 gün: 08-01:12  07-31:36  07-30:40  07-29:41  07-28:40  07-27:39
            07-26:1(Pazar)  07-25:11(Cmt)  07-24:37  07-23:41  07-22:38  07-21:43
```

**Tüm aktif sürücülerin (48/48) ehliyet kaydı var** — atama/uygunluk kontrolleri boş veri yüzünden patlamaz.

## Batarya (hepsi yeşil)

| Kontrol | Sonuç |
| --- | --- |
| `npx tsc -p tsconfig.json --noEmit` | TSC OK |
| `npm test` | 358/358 pass, 79 spec dosyası, 0 fail |
| `npx ts-node --transpile-only scripts/tenant-isolation-check.ts` | Tenant isolation check passed |
| gateway + `codec8-sim --scenario normal --seed 42 \| verify-tacho-telematics` | `"ok": true` |

## Demoda nereye bakılır

Giriş: `admin@fleet.com` / `backend/.env` içindeki `SEED_ADMIN_PASSWORD`.

| Ekran | Ne görünür |
| --- | --- |
| Dashboard | Günlük KPI'lar, faturalanmamış iş + gecikmiş fatura kartları |
| Einsatzplan (üst sekmeler) | Günlük özet, Planlama, Sabah check-in, Araç devirleri, Firma e-postaları, İzin planlayıcı, Gelir özeti |
| Fahrer / Ehliyet uyumu | 48 sürücü, süresi dolmuş + yakında dolacak ehliyet vakaları, 156 kontrol kaydı |
| Fahrzeuge | 45 aktif araç, ekipman + bakım kuralları |
| Mängel / Arızalar | 50 arıza, çıkış kontrollerinden gelen kayıtlar |
| Bußgelder | 18 ceza (Almanca ihlal tipleri) |
| Unfälle | 21 kaza / yük hasarı |
| Service-Historie | 46 servis kaydı |
| Erinnerungen / Dokumente | 120 hatırlatma, 63 belge (HU + Führerschein süreleri) |
| Kraftstoff | 109 yakıt kaydı |
| Invoicing | 8 fatura (draft/sent/paid/overdue), 16 satır, 4 ödeme, Mahnung geçmişi |
| Telematik / Takograf | 106 trip, canlı simülasyon doğrulaması yeşil |

## Tekrar üretmek için

```bash
cd backend
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run seed:demo-all
# sadece ay:
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run seed:demo-month
# pencereyi değiştir:
SEED_DAYS_BACK=60 SEED_DAYS_FORWARD=7 npm run seed:demo-month
```
