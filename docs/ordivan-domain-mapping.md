# Ordivan — Domain Mapping

**Amaç:** Ordivan otomasyonu Fleet'in domain'ine bir şey *eklemeden önce*, mevcut
modellerin gerçekte neyi temsil ettiğini repo kanıtıyla yazıya dökmek.

Bu doküman bir tasarım önerisi değil, bir **tespit**tir. Her cevabın yanında onu
doğrulayan dosya/satır var. Tespit ile varsayımı ayırmak için her karar
işaretli:

| İşaret | Anlamı |
|---|---|
| `confirmed` | Repo kanıtıyla doğrulandı; kod bunu böyle uyguluyor. |
| `provisional` | Kanıt yönü gösteriyor ama bir ürün kararı gerekiyor; değişebilir. |
| `open` | Cevap yok. İnsan kararı bekliyor. |

> **Kapı:** Aşağıdaki beş sorunun tamamı `confirmed` ya da açıkça onaylanmış bir
> `provisional` hâline gelmeden **Faz 15 başlayamaz**. Faz 12 bu dokümanı
> üretir; onaylamaz.

Faz 12 kapsamında **hiçbir modeli migrate etmiyor, `TransportOrder`
oluşturmuyoruz.** Buradaki her şey okumadır.

---

## 1) `transport-request` gerçekte neyi temsil ediyor?

**Karar: `confirmed` — bu bir MÜŞTERİ SİPARİŞİ DEĞİL, iç planlama talebidir.**

Model: `backend/prisma/schema.prisma` → `model TransportRequest`

Kanıt:

- `driverId String` **zorunlu**. Bir müşteri siparişinde şoför baştan belli
  olmaz; burada talebi *başlatan* zaten bir şofördür.
- `vehicleId String` **zorunlu** — aynı gerekçe.
- `assignmentId String? @unique` + `assignment Assignment?` — talebin varış
  noktası tek bir `Assignment`. `@unique` olması "bir talep en fazla bir görev
  üretir" demek. Bir müşteri siparişi ise birden fazla göreve bölünebilirdi.
- `conflictReason String?` ve `TransportRequestStatus { pending, approved,
  rejected, needs_review }` — sözlük tamamen **iç onay akışının** sözlüğü.
  Müşteri siparişinde "çakışma sebebi" diye bir alan olmaz.
- Uçlar: `backend/src/transport-requests/transport-requests.controller.ts`
  → `POST /transport-requests/:id/approve` ve `.../reject`. Onaylayan taraf
  ofis/yönetim; talep eden şoför.

**Sonuç:** `TransportRequest` = *"şoför bir iş talep etti, ofis onaylayınca
`Assignment`'a dönüşür"*. Gelecekteki `TransportOrder` ile **aynı şey değildir**
ve onun yerine geçmemelidir.

---

## 2) `assignment` görev mi, atama mı, operasyon mu?

**Karar: `confirmed` — üçü birden; ve ayrıca FATURALANABİLİR birim.**

Model: `model Assignment`

Kanıt — üç sorumluluğu aynı anda taşıyor:

| Sorumluluk | Kanıt alanı/ilişkisi |
|---|---|
| **Atama** (kim, hangi araç) | `driverId`, `vehicleId` (ikisi de zorunlu, `onDelete: Restrict`) |
| **Operasyon** (o gün ne yapılacak) | `cargoName`, `pickupAddress`, `deliveryAddress`, `workDate`, `startTime`/`endTime`, `status: AssignmentStatus` |
| **Ticari kayıt** | `expectedDailyRevenue`, `invoiceLines InvoiceLine[]`, `invoiceClaim InvoiceAssignmentClaim?` |

Ayrıca yürütme kanıtlarının bağlandığı yer de burası: `departureChecks`,
`morningCheckins`, `vehicleHandovers`, `fleetTrips`, `matchedFines`,
`workTimeEvents`, `customerMessages`.

**Bunun bedeli:** `Assignment` bugün hem "günün işi" hem "faturanın satırı".
Bir müşteri siparişi birden fazla güne yayıldığında bu model tek başına
yetmez — `TransportOrder` ihtiyacının asıl kaynağı budur.

---

## 3) `Tour` ve `TourStop` hangi sorumluluklara sahip?

**Karar: `confirmed` — Tour = bir aracın bir gününün ROTA PLANI; TourStop = tek
durak, planı ve gerçekleşeni AYRI tutarak.**

Modeller: `model Tour`, `model TourStop`

`Tour` sorumluluğu:

- Kapsam: `vehicleId?`, `driverId?`, `workDate`, `depotLocationId?` — yani
  **bir araç/şoför, bir gün**.
- Plan çıktısı: `plannedDistanceKm`, `plannedDurationMin`, `plannedFuelLiters`,
  `plannedTollCents`.
- Optimizasyon defteri: `baselineDistanceKm`, `baselineDurationMin`,
  `optimizedAt`, `optimizationJobId`, `optimizationError`.
- `TourStatus` ile kendi yaşam döngüsü var.

`TourStop` sorumluluğu:

- Sıra: `sequence` (optimizasyon yeniden yazar) + `plannedSequence` (kullanıcının
  girdiği ilk sıra korunur).
- **Yük ve zaman penceresi:** `weightKg`, `volumeM3`, `windowStart`, `windowEnd`,
  `serviceMinutes`.
- Bacak bilgisi: `legDistanceKm`, `legDurationMin`, `legShape`.
- **Yürütme kaydı planlamadan ayrı:** `status`, `arrivedAt`, `completedAt`,
  `completedLatitude/Longitude`, `clientEventId` (çevrimdışı kuyruk tekrarı).

Şemadaki kendi yorumu bunu açıkça söylüyor: *"Yurutme kaydi. Planlama
alanlarindan ayri: plan optimizasyonla yeniden yazilabilir, gerceklesen ise
degismez."*

---

## 4) Gelecekteki `TransportOrder` bunlarla nasıl ilişkilenecek?

**Karar: `provisional` — `TransportOrder n:m Tour` doğru varsayım; ve bu
ilişkinin taşıyıcısı ZATEN VAR: `TourStop`.**

En önemli tespit şu: **n:m bağlantı kaydı sıfırdan tasarlanmayacak, çünkü
`TourStop` bugün tam olarak o işi `Assignment` için yapıyor.**

```
Assignment 1 ──< TourStop >── 1 Tour
```

- `TourStop.assignmentId String?` (`onDelete: SetNull`, `@@index([assignmentId])`)
- Bir `Assignment` birden çok `TourStop`'a bağlanabilir → **bir iş birden çok
  tura bölünebilir**.
- Bir `Tour` birden çok `TourStop` taşır, her biri farklı `Assignment`'tan
  olabilir → **bir tur birden çok iş taşıyabilir**.

Yani spec'in istediği n:m semantiği **kavramsal olarak zaten uygulanmış**;
eksik olan tek şey bağlanan tarafın `Assignment` yerine `TransportOrder` olması.

Spec, bağlantı kaydının "tahsis edilen yük, ağırlık, gelir/maliyet payı veya
segment bilgisi" taşımasını istiyor. `TourStop`'un bugünkü hâli bunun
çoğunu **zaten taşıyor**:

| Spec'in istediği | `TourStop`'ta karşılığı | Durum |
|---|---|---|
| tahsis edilen yük | `weightKg`, `volumeM3` | ✅ var |
| segment bilgisi | `sequence`, `legDistanceKm`, `legDurationMin`, `legShape` | ✅ var |
| zaman penceresi | `windowStart`, `windowEnd`, `serviceMinutes` | ✅ var |
| gelir/maliyet payı | — | ❌ yok (bugün `Assignment.expectedDailyRevenue` gün düzeyinde) |

**Önerilen yön (`provisional`, Faz 15'te karara bağlanacak):**
`TourStop`'a `assignmentId`'nin **yanına** `transportOrderId String?` eklemek;
`Assignment` yolunu kırmadan yaşatmak. Ayrı bir `TransportOrderTourLink` tablosu
açmak, aynı gerçeği iki yerde tutar ve "hangi durak hangi siparişe ait" sorusunu
iki farklı yoldan cevaplanabilir hâle getirir.

**`open` kalan alt sorular** (insan kararı gerekli):

- `open` — Gelir/maliyet payı durak düzeyinde mi tutulacak, yoksa sipariş
  düzeyinde kalıp faturalamaya mı bırakılacak?
- `open` — Bir sipariş birden çok tura bölündüğünde faturalama hangi kaydı
  esas alacak: sipariş mi, duraklar mı?
- `open` — `Assignment` uzun vadede `TransportOrder`'ın bir *günlük dilimi*
  hâline mi gelecek, yoksa ikisi paralel mi yaşayacak?

---

## 5) Hangi mevcut endpoint korunacak, genişletilecek veya deprecated olacak?

`confirmed` — aşağıdaki tablo bugünkü uçların **Faz 12'deki** durumudur.
Faz 12 bunların **hiçbirini değiştirmiyor**; tablo gelecekteki niyeti kaydeder.

| Uç | Dosya | Niyet |
|---|---|---|
| `GET/POST /transport-requests`, `:id/approve`, `:id/reject` | `transport-requests.controller.ts` | **korunacak** — iç talep akışı; sipariş kavramıyla karışmayacak |
| `GET/POST/PATCH /assignments`, `:id/cancel`, `:id/transition` | `assignments.controller.ts` | **korunacak + genişletilecek** — `TransportOrder` geldiğinde opsiyonel sipariş bağı eklenecek, alanlar kaldırılmayacak |
| `GET/POST /routing/tours`, `:id` | `tour.controller.ts` | **korunacak + genişletilecek** — durak oluşturmada sipariş referansı |
| `GET /driver/tours/today`, `stops/:stopId/mark`, `.../reset` | `tour-driver.controller.ts` | **korunacak** — şoför yürütmesi sipariş kavramından bağımsız kalmalı |
| `POST /routing/locations/pick`, `GET /routing/address-suggestions` | `routing.controller.ts` | **korunacak** — adres/geocode altyapısı ortak |
| — | — | **deprecated: yok.** Faz 12'de hiçbir uç kullanımdan kaldırılmıyor. |

---

## Faz 12'nin bu dokümana getirdiği sınır

Ordivan bu fazda **hiçbir domain kaydı yazmıyor**. Onay ekranındaki "Onayla"
düğmesi bir `Assignment`, `Tour`, `ServiceRecord` ya da fatura **üretmez** —
yalnızca `AutomationProposal`'ın durumunu değiştirir ve bir
`AutomationCorrectionEvent` bırakır.

Gerçek domain yazımı, yukarıdaki `open` maddeleri kapandıktan sonra ele
alınacaktır.
