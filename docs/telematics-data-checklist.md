# Telematik & Tachograph Veri Kontrol Listesi

> Hedef: aşağıdaki tüm veri noktalarını platforma işlemek.
> Her satır: veri → kaynak → hedef (Prisma modeli/alan + sayfa) → durum → faz.
> Durum: ✅ var · 🟡 kısmi (model var, cihazdan besleme eksik) · ⏳ yapılacak.

Faz kısaltmaları: **C2** = cihaz telemetri ingest + modeller · **C3** = işleme + telematik sayfaları · **C4** = tachograph/compliance.

---

## 9.1 Telematikten alınan veriler (operasyon)

Kaynaklar: OBD-II · CAN Bus · FMS (kamyonlarda) · GPS · IMU (ivme sensörü)

| Veri | Kullanım | Hedef (model / sayfa) | Durum | Faz |
|---|---|---|---|---|
| Canlı konum | Harita, ETA | `DriverLocationLatest` (source=telematics) → `/live-tracking` | 🟡 uç var, cihaz beslemesi eksik | C2 |
| Rota geçmişi | Operasyon analizi | `DriverLocationHistory` / `FleetTripLocationPoint` → `/fleet-analytics/trips` | 🟡 model+sayfa var, device feed eksik | C2 |
| Hız | Hız ihlali | telemetri + `FleetDrivingEvent` (type=speeding) | 🟡 model var | C2 |
| Yakıt | Yakıt maliyeti | `FleetFuelEntry` + CAN `VehicleTelemetryLatest.fuelLevelPct` → `/fleet-analytics/fuel` | 🟡 manuel var, CAN eksik | C2 |
| Motor verileri (RPM) | Bakım | `VehicleTelemetryLatest.rpm` (yeni) → Araç Sağlığı | ⏳ | C2→C3 |
| DTC arızaları | Servis planlama | `VehicleDtc` (yeni) → `/telematics/vehicle-health` | ⏳ | C2→C3 |
| Rölanti | Yakıt tasarrufu | `FleetTrip.idleS` | 🟡 model var, device feed eksik | C2 |
| Sert fren | Güvenlik | `FleetDrivingEvent` (harsh_brake) | 🟡 model var | C2→C3 |
| Sert hızlanma | Driver Score | `FleetDrivingEvent` (harsh_accel) → `/telematics/driver-scores` | 🟡 model var | C2→C3 |
| Sert viraj | Risk analizi | `FleetDrivingEvent` (harsh_corner — enum'a eklenecek) | ⏳ | C2→C3 |
| Motor sıcaklığı | Arıza tahmini | `VehicleTelemetryLatest.coolantTemp` (yeni) → Araç Sağlığı | ⏳ | C2→C3 |
| Akü voltajı | Bakım | `VehicleTelemetryLatest.voltage` (yeni) → Araç Sağlığı | ⏳ | C2→C3 |
| Kilometre | Servis periyodu | `Vehicle.odometer` / `VehicleTelemetryLatest.odometerKm` + `FleetMaintenanceRule` | 🟡 model var | C2 |

**Sonuç:** Operasyon tarafının veri modeli büyük ölçüde hazır; iş, cihazdan (`source=device`) besleme + iki yeni model (`VehicleTelemetryLatest`, `VehicleDtc`) + iki sayfayı doldurmak. → **C2 + C3**

---

## 9.2 Takograftan alınan veriler (compliance)

Takograf yalnızca yasal verileri verir (kaynak: FMC650 · K-Line canlı + DDD).

| Veri | Kullanım | Hedef (model / sayfa) | Durum | Faz |
|---|---|---|---|---|
| Sürüş süresi | AB mevzuatı | `TachoActivity` (yeni) → `/tachograph/remaining-driving-time` | ⏳ | C4 |
| Dinlenme süresi | Compliance | `TachoActivity` (yeni) | ⏳ | C4 |
| Mola | Compliance | `TachoActivity` (yeni) | ⏳ | C4 |
| Driver Card | Kim sürüyor | `TachoActivity.driverCardNo` / `Device` eşleme | ⏳ | C4 |
| DDD dosyaları | Denetim | `DddFile` (yeni) + 2 yıl arşiv → `/tachograph/ddd-archive` | ⏳ | C4 |
| İhlaller | Uyarı | `TachoInfringement` (yeni) → `/tachograph/infringements` | ⏳ | C4 |
| Haftalık sürüş | Compliance | ihlal motoru (561/2006) | ⏳ | C4 |
| İki haftalık limit | Compliance | ihlal motoru (561/2006) → `/tachograph/compliance` | ⏳ | C4 |

**Sonuç:** Tachograph tarafı tamamen yeni: DDD alma servisi + parser + ihlal motoru + yeni modeller + 4 sayfa. Gerçek FMC650 + şirket kartı gerektirir. → **C4 (sona bırak)**

---

## Uygulama sırası
1. **C2** — `Device`, `VehicleTelemetryLatest`, `VehicleDtc` + telemetri ingest + simülatör → tüm operasyon verisini `source=device` ile doldur.
2. **C3** — işleme (driver score, araç sağlığı) + `/telematics/driver-scores` ve `/telematics/vehicle-health` sayfalarını gerçek veriye bağla.
3. **C4** — tachograph: DDD servisi + ihlal motoru + 4 sayfa (FMC650 geldiğinde).

Her faz için hazır VS Code promptları verildi (C2 + frontend). C4 promptu FMC650 aşamasında.
