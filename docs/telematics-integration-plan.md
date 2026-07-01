# Telematik Donanım Entegrasyon Planı (FMC130 + FMC650)

> Amaç: Samsara benzeri entegre telematik katmanını mevcut Fleet platformuna eklemek.
> Hedef pazar: Almanya / AB. Tarih: 2026-07-01.

Bu belge, gerçek telematik donanımını (Teltonika **FMC130** binek/van, **FMC650** kamyon + tachograph) mevcut NestJS + Prisma + Next.js monorepo'ya entegre etmek için hazırlanan plandır. Mevcut kod tabanına göre yazılmıştır.

---

## 1. Durum tespiti (gap analizi)

### Zaten var
- **`POST /tracking/telematics/ingest`** — `IngestTelematicsDto` ile **yalnızca konum** (lat/lon, `speedMps`, `headingDeg`, `accuracyM`, `recordedAt`). `LocationSource` enum'unda `mobile | telematics` tanımlı.
- **Canlı takip:** `GET /tracking/live/stream` (SSE), `GET /tracking/live`, sürücü/araç geçmişi uçları. Frontend'de `(dashboard)/live-tracking` + leaflet haritası.
- **Analitik veri modeli (device-ready!):** `FleetTrip` (distanceKm, durationS, avgSpeed, maxSpeed, idleS, score, status), `FleetTripLocationPoint` (rota noktaları), `FleetDrivingEvent` (`speeding | harsh_accel | harsh_brake`, lat/lon, value, threshold), `FleetFuelEntry`, `FleetMaintenanceRule` (intervalKm/Days). Kritik: `FleetTelemetrySource` enum'unda **`phone | device | api`** var → bu modeller **telematik cihazdan beslenmeye hazır** tasarlanmış. `Vehicle` üzerinde `avgConsumptionLPer100Km`, `initialOdometerKm`, `odometerCorrectedKm`.
- **Konum modelleri:** `DriverLocationLatest`, `DriverLocationHistory` (alan: `source`, `vehicleId`, `speedMps`, `headingDeg`, `altitudeM`).
- **Yatay altyapı:** rol bazlı yetki (`OPERATIONAL_ROLES`, `RequiresWrite`, guard'lar), multi-tenant (`tenantId`), i18n + Almanca yasal sayfalar, DVIR (`departure-checks`), `defects`, `fines`/Bußgeld, recharts.

### Eksik (donanım boşluğu) — düzeltilmiş
Sürücü davranışı, tripler, yakıt ve bakım **zaten modellenmiş**; gerçek boşluk çok daha dar:
1. **Cihaz ağ geçidi yok.** Teltonika cihazı **Codec 8'i TCP** ile konuşur; mevcut ingest endpoint'i JWT + rol korumalı REST — cihaz doğrudan bağlanamaz.
2. **Cihaz kaydı (IMEI → araç) yok.** Gateway'in eşleme için bir `Device` modeline ihtiyacı var.
3. **Cihazdan `FleetTrip`/`FleetDrivingEvent` üretimi yok.** Bu modeller büyük olasılıkla telefondan (`source=phone`) besleniyor; telematik akışından **`source=device`** ile trip + olay üreten servis yok.
4. **Araç sağlığı / DTC yok.** Canlı CAN sinyalleri (rpm, soğutucu, voltaj, yakıt %) için anlık snapshot ve **DTC (arıza kodu) modeli yok** — sadece `FleetMaintenanceRule` (periyodik) var.
5. **Olay türü dar.** `FleetDrivingEventType` = `speeding | harsh_accel | harsh_brake`; `harsh_corner`/`crash` yok (gerekirse enum genişletilir).
6. **Tacho / Compliance yok.** FMC650 için **DDD dosyası + K-Line canlı veri + 561/2006 ihlal motoru + 2 yıl arşiv**.

---

## 2. Hedef mimari

```
FMC130 / FMC650
      │  Codec 8 / Codec 8 Extended (TCP)  +  DDD (tacho, FMC650)
      ▼
Device Gateway (ayrı servis)          ← C1
  - IMEI → araç eşleme (Device)
  - Codec 8 parse → normalize kayıt
  - servis-token'lı iç uçtan backend'e iletir
      ▼
Backend ingest (genişletilmiş)        ← C2
  - /tracking/telematics/ingest (konum, mevcut)
  - /tracking/telematics/telemetry (zengin, yeni)
      ▼
Prisma (PostgreSQL)
  - DriverLocation* (mevcut, source=telematics)
  - VehicleTelemetry / VehicleEvent / VehicleDtc (yeni)
      ▼
Processing (kural motoru)             ← C3
  - sürücü skoru, araç sağlığı, yakıt verimliliği
      ▼
Mevcut dashboard / harita / analytics ← C5
  - live-tracking, fleet-analytics + yeni görünümler
```

**Kilit ilke:** Simülatör ve gerçek cihaz **aynı normalize kaydı** üretir; gateway swap edilir, üst katman değişmez.

---

## 3. Faz faz plan

### C1 · Cihaz ağ geçidi + kayıt
- Ayrı bir servis (veya backend içinde ayrı bir bootstrap): **Codec 8 TCP dinleyici**.
- Yeni model **`Device`**: `imei`, `vehicleId`, `model` (`FMC130`/`FMC650`), `lastSeenAt`, `tenantId`.
- Gateway: IMEI → araç eşle, Codec 8 paketini çöz, normalize kaydı üret, backend'e **servis-token / API-key** ile ilet (JWT değil).
- **Cihaz yokken:** aynı gateway'e Codec 8 üreten bir **simülatör** ya da doğrudan ingest uçlarına POST atan sahte kaynak.

### C2 · Cihaz telemetri ingest — MEVCUT MODELLERİ KULLAN (ÖNCE BUNU YAP)
Yeni analitik modeli **uydurmuyoruz**; mevcutları `source=device` ile besliyoruz. Sadece gerçekten eksik olanı ekliyoruz.

- **Ekle (yeni, küçük):**
  - **`Device`** — `imei`, `vehicleId`, `model` (`FMC130`/`FMC650`), `lastSeenAt`, `tenantId`. (IMEI→araç eşleme.)
  - **`VehicleTelemetryLatest`** — araç başına anlık CAN snapshot (rpm, fuelLevelPct, coolantTemp, voltage, odometerKm, updatedAt). Yüksek frekanslı history şart değil; önce "son durum".
  - **`VehicleDtc`** — arıza kodu (ts, vehicleId, code, description, severity, cleared).
  - (Gerekirse) `FleetDrivingEventType`'a `harsh_corner`, `crash` ekle.
- **Kullan (mevcut):** konum → `DriverLocation*` (`source=telematics`) ve/veya `FleetTripLocationPoint`; sürüş olayları → `FleetDrivingEvent`; seyahatler → `FleetTrip` (`source=device`); yakıt/verimlilik → `FleetFuelEntry` + `FleetTrip.score`/`avgSpeed`.
- **Ingest servisi:** cihaz/gateway kaydını alıp: (a) konumu günceller, (b) açık `FleetTrip`'i sürdürür/kapatır, (c) eşik aşımında `FleetDrivingEvent` yazar, (d) `VehicleTelemetryLatest`/`VehicleDtc` günceller.

### C3 · İşleme (kural motoru)
- `FleetDrivingEvent` → **sürücü davranış skoru** (mevcut `FleetTrip.score` mantığıyla) → sürücü modülü.
- `VehicleDtc` → **araç sağlığı** durumu → araç detay / bakım (mevcut `FleetMaintenanceRule` ile birlikte).
- CAN yakıt / trip → **verimlilik** → mevcut `FleetFuelEntry` / `FleetTrip` / `avgConsumptionLPer100Km` ile hizala.

### C4 · Tacho / Compliance (FMC650)
- **DDD dosya alıcı** (gateway veya ayrı uç) + parser.
- Tacho canlı: sürüş/dinlenme durumu, **kalan sürüş süresi**.
- **İhlal motoru** (EU 561/2006 + AETR); ceza tahmini mevcut `fines`/Bußgeld mantığıyla örtüştürülebilir.
- **2 yıl arşiv** + denetim raporu. Yeni `compliance` modülü + modeller.

### C5 · Frontend
- `live-tracking` haritasına telematik araç pinleri + durum.
- `fleet-analytics`'e yeni metrikler (rölanti, CO₂, km başına maliyet).
- Sürücü davranış scorecard, araç sağlığı (DTC), compliance görünümleri — recharts/leaflet mevcut, minimum yeni bileşen.

---

## 4. Simülasyon stratejisi (cihaz yokken)

İki seçenek, ikisi de aynı normalize sözleşmeyi kullanır:
1. **Basit:** mevcut `/tracking/telematics/ingest` + yeni telemetry ucuna servis-token ile POST atan bir Node simülatörü (en hızlı).
2. **Gerçekçi:** gateway'in TCP portuna Codec 8 paketi üreten simülatör (gerçek cihaz akışını birebir taklit eder).

Öneri: MVP'de (1) ile başla, C1 gateway hazır olunca (2)'ye geç.

---

## 5. Önerilen sıra ve ilk adım

| Sıra | İş | Not |
|---|---|---|
| 1 | **C2** — `Device` + `VehicleTelemetryLatest` + `VehicleDtc` modelleri + `IngestTelemetryDto` + ingest servisi (mevcut `FleetTrip`/`FleetDrivingEvent`'i `source=device` besler) | Temel; her şey buna bağlanır |
| 2 | Simülasyon kaynağı (seçenek 1) | Cihaz yokken uçtan uca test |
| 3 | C3 işleme (skor, sağlık, verimlilik) — mevcut modüllere bağla | Yeni ekran minimum |
| 4 | C5 frontend görünümleri | Mevcut bileşenleri besle |
| 5 | C1 gateway (Codec 8 TCP) + `Device` eşleme | Gerçek cihaz gelince |
| 6 | C4 tacho/compliance (FMC650) | DDD + ihlal motoru |

**İlk somut adım:** C2 — sadece eksik modeller (`Device`, `VehicleTelemetryLatest`, `VehicleDtc`) + `IngestTelemetryDto` + cihaz ingest servisi (mevcut `FleetTrip`/`FleetDrivingEvent`'i `source=device` ile besler) + migration. Ardından simülasyon kaynağıyla uçtan uca doğrulama.

---

## 6. Riskler / notlar
- **Kimlik doğrulama:** cihaz/gateway JWT kullanamaz → ayrı servis-token / API-key guard gerekir.
- **Veri hacmi:** `VehicleTelemetry` hızlı büyür → indeks, saklama politikası, ileride partisyon/TimescaleDB.
- **Multi-tenant:** yeni modellerde `tenantId` izolasyonunu koru.
- **GDPR/BDSG:** sürücü davranış verisi hassas → şeffaflık + saklama süresi + (Almanya) Betriebsrat onayı.
- **CAN adaptörü:** FMC130'da CAN verisi için LV-CAN200 gerekir; tacho yalnızca FMC650.
