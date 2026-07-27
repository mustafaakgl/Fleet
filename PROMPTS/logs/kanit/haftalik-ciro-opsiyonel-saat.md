# Kanıt — Haftalık Şirket Cirosu + Opsiyonel Saatler

Tarih: 2026-07-27
Kapsam: Faz 3 (haftalık şirket bazlı ciro raporu) → Faz 2 (timeline dialogunda bedel) → Faz 1 (opsiyonel saat alanları)

## Yapılan işler

### Faz 3 — Haftalık şirket bazlı ciro
- `backend/src/dashboard/dashboard.service.ts`: `getRevenueByCompany(from, to, role)` eklendi.
  - Varsayılan aralık: içinde bulunulan ISO haftası (Pzt–Paz).
  - Maksimum aralık 366 gün; `to < from` reddediliyor.
  - Sayılan statüler: `planned, confirmed, in_progress, completed`.
  - Ciro kaynağı: atamada girilen `expectedDailyRevenue`, yoksa `company.defaultDailyRevenue`.
  - Finansal rol dışındakilere `null` döner.
- `backend/src/dashboard/dashboard.controller.ts`: `GET /api/v1/dashboard/revenue-by-company` (`@Roles(...FINANCIAL_ROLES)`).
- `frontend/lib/types.ts`: `DashboardRevenueByCompany`, `DashboardRevenueByCompanyRow`.
- `frontend/lib/api.ts`: `dashboardApi.getRevenueByCompany(from, to)`.
- `frontend/components/einsatzplan/WeeklyCompanyRevenue.tsx` (yeni): hafta navigasyonu (◀ / bu hafta / ▶),
  özet kartları (toplam ciro, atama sayısı, atama başına ortalama), recharts bar grafiği,
  firma/atama/ciro/pay tablosu + toplam satırı, Excel export (dinamik `xlsx` importu).
- `frontend/components/einsatzplan/RevenueSummary.tsx`: yeni bölüm `/assignments?panel=revenue` sekmesine bağlandı.

### Faz 2 — Timeline dialogunda bedel
- `frontend/components/vehicles/CreateTimelineAssignmentDialog.tsx`: opsiyonel
  `expected_daily_revenue` alanı eklendi; firma varsayılan tutarı placeholder + ipucu olarak gösteriliyor.

### Faz 1 — Opsiyonel saat alanları
- `backend/prisma/schema.prisma`: `Assignment.startTime` / `endTime` → `String?`.
- `backend/prisma/migrations/20260720090000_assignment_optional_times/migration.sql`: `DROP NOT NULL`.
- DTO'lar: `create-assignment.dto.ts` `start_time`/`end_time` artık `@IsOptional()`;
  her iki DTO'da TIME_REGEX boş string'i de kabul ediyor (boş = tüm gün / temizle).
- `assignments.service.ts`:
  - `normalizeTime()` → boş string `null`'a çevriliyor.
  - `timesOverlap()` taraflardan biri saatsizse `false` döner → **saatsiz atamalar çakışma sayılmaz,
    çifte atamaya izin verilir** (kullanıcı kararı).
  - Araç çakışma sorgusu (`activeVehicleAssignment`) saatsiz atamalarda atlanıyor.
- Null-güvenliği: `company-emails.service.ts`, `customer-portal/customer-assignment.types.ts` (izin alındı),
  `fine-management/fine-matching.service.ts` (saatsiz atama tüm güne 00:00–23:59 eşleştirilir),
  `tachograph/tachograph-format.util.ts` (saatsizde süre 0).
- Frontend: `assignments/new/page.tsx` zod `.optional()` + etiketlerden `*` kaldırıldı + bilgi notu;
  `VehicleAssignmentsTimeline.tsx` saatsiz atamayı tüm gün gösterir ("Ganztags"), çakışma kontrolünden muaf;
  `drivers/[id]/page.tsx` ve `fleet-hydration.ts` null-hardened.

### i18n
de/en/tr `common.json` dosyalarına 21'er anahtar eklendi (`weeklyRevenue.*`,
`vehicleAssignments.create.revenueHint*`, `vehicleAssignments.allDay`, `assignmentForm.timeOptionalHint`).
Üç dosyada da eşit sayıda anahtar doğrulandı.

## Doğrulama bataryası

| Adım | Sonuç |
|---|---|
| `backend: npx tsc -p tsconfig.json --noEmit` | ✅ temiz |
| `backend: npm test` | ✅ 237/237 pass, 0 fail (66 spec) |
| `node scripts/codec8-sim.mjs --scenario normal --seed 42` | ✅ 5/5 kayıt kabul, ack 5 |
| `node scripts/codec8-sim.mjs ... \| node scripts/verify-tacho-telematics.mjs` | ✅ 5/5 konum, telemetry latest, DTC, quarantine ve closed trip geçti |
| `npx ts-node scripts/tenant-isolation-check.ts` | ✅ passed |
| `frontend: npm run verify` | ✅ i18n + tsc + Next production build (104/104 sayfa) |

### Tacho seed düzeltmesi

İlk çalıştırmada demo aracın son ataması 2026-07-19 olduğu için `resolveDriverId()` null dönmüştü.
Mevcut `node scripts/seed-tacho-demo.mjs` komutu bugüne `in_progress` atama oluşturacak şekilde zaten
tasarlanmıştı; seed yeniden çalıştırıldı. Ardından tam batarya baştan çalıştırıldı ve tüm kontroller geçti.

## Commit durumu
Tam batarya yeşil; milestone commit için hazır.
