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
>
> **Durum (Faz 15):** Kapı **açıldı**. 4. bölümdeki üç `open` alt soru karara
> bağlandı ve `TourStop.transportOrderId` önerisi reddedildi — gerekçeler
> bölümün içinde. Beş sorunun tamamı artık `confirmed`.

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

**Karar: `confirmed` (Faz 15) — `TransportOrder` ticari sipariştir; operasyona
`Assignment` üzerinden bağlanır. `Tour` ile **doğrudan** bir bağı yoktur.**

Faz 12 bu bölümü `provisional` bırakmış ve `TourStop`'a `transportOrderId`
eklemeyi önermişti. **Faz 15 bu öneriyi reddetti.** Gerekçe aşağıda.

### Kavramların kesin karşılığı

| Kavram | Anlamı |
|---|---|
| `TransportOrder` | **Müşteriden gelen ticari sipariş.** Ticari gerçek. |
| `Assignment` | Siparişin **günlük/operasyonel çalışma dilimi**. |
| `Tour` | Birden fazla `Assignment`'ı taşıyan **araç rotası**. |

### İlişkiler

```
TransportOrder 1 ──< Assignment 1 ──< TourStop >── 1 Tour
```

- `TransportOrder → Assignment`: **1:n**. Bir sipariş birden çok güne/dilime
  bölünür; her dilim bir `Assignment`'tır.
- Bir `Assignment` **yalnız bir** `TransportOrder`'a ait olabilir.
- Mevcut `TourStop.assignmentId` bağlantısı **korunur** ve tek yol olarak kalır.

### `TourStop.transportOrderId` EKLENMİYOR

Ayrı bir Order–Tour link tablosu da açılmıyor. Sebep: sipariş ile tur arasındaki
ilişki `Assignment` üzerinden **zaten türetilebiliyor**. İkinci bir yol açmak,
"bu durak hangi siparişe ait" sorusunu iki farklı kaynaktan cevaplanabilir hâle
getirir ve ikisi kaçınılmaz olarak birbirinden ayrışır. Bir gerçeğin iki yeri
olduğunda, hangisinin doğru olduğunu söyleyen bir kural gerekir — ve o kural
hiçbir zaman yazılmaz.

Aktarma (transshipment) gerekiyorsa **tek bir `Assignment` birden fazla tura
bağlanmaz**; ayrı operasyon dilimleri (ayrı `Assignment`'lar) kullanılır.

### Gelir nerede durur — `confirmed`

> Faz 12'nin `open` sorusu: *"Gelir/maliyet payı durak düzeyinde mi tutulacak?"*

- **Sipariş geliri** `TransportOrder`'da (sözleşme tutarı + para birimi).
- **Operasyon dilimine ayrılan gelir** `Assignment`'ta — ve bunun için **yeni
  alan açılmadı**: mevcut `Assignment.expectedDailyRevenue` bu anlamı zaten
  taşıyor. Aynı anlamda ikinci bir alan, iki farklı toplam demektir.
- `Assignment` üzerinde ayrı bir `currency` alanı **yok**: para birimi bağlı
  olduğu siparişten, sipariş yoksa `Tenant.baseCurrency`'den çözülür. İkinci bir
  para birimi alanı, siparişle çelişebilen bir tutar üretirdi.
- **`TourStop`'a gelir ya da maliyet payı KOPYALANMAZ.** Gerçek maliyet zaten
  yakıt (`FleetFuelEntry`), servis (`ServiceRecord`), ceza (`Fine`) ve
  trip (`FleetTrip`) kayıtlarından hesaplanıyor. Duraklara kopyalanan bir pay,
  bu kayıtlar değiştiğinde sessizce yanlışa dönerdi.

### Faturalama neye dayanır — `confirmed`

> Faz 12'nin `open` sorusu: *"Sipariş birden çok tura bölündüğünde faturalama
> hangi kaydı esas alacak?"*

**Tur tamamlanmasına DEĞİL**, doğrulanmış teslimat / `Assignment` kapsamına.
Bir turun bitmesi, o turdaki her işin müşteriye teslim edildiği anlamına
gelmez. Faturalanabilirliğin dayanağı `Assignment` düzeyindeki teslimat
gerçeğidir.

Tekillik için **yeni bir model kurulmadı**: `InvoiceAssignmentClaim`
(`assignmentId @unique`) bugün zaten "bir `Assignment` en fazla bir kez
faturalanır" garantisini veritabanında veriyor.

### `Assignment`'ın uzun vadeli yeri — `confirmed`

> Faz 12'nin `open` sorusu: *"`Assignment` `TransportOrder`'ın günlük dilimi mi
> olacak, yoksa ikisi paralel mi yaşayacak?"*

`Assignment` siparişin **operasyonel dilimidir** — ama paralel de yaşar:
`transportOrderId` **nullable** kalır. Sebep: bugünkü kayıtların hiçbirinin
siparişi yok ve şoför talebinden (`TransportRequest`) doğan işler bir müşteri
siparişine ait olmayabilir. **Eski `Assignment`'lar uydurma siparişlere
bağlanmaz**; `null` ile çalışmaya devam ederler.

`TransportRequest`'in 1. bölümdeki doğrulanmış anlamı **değişmedi**: iç planlama
talebi olarak kalır ve ikinci bir sipariş modeli hâline getirilmez.

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

## Faz 15'in bu dokümana getirdiği değişiklik

4. bölümdeki üç `open` alt soru `confirmed` oldu ve `TourStop.transportOrderId`
önerisi **reddedildi**. Faz 15 bu kararlara dayanarak `TransportOrder`,
`Consignment` ve sipariş revizyonlarını kuruyor; `Assignment`'a **yalnız
nullable** bağlantı alanları ekliyor. Ordivan, e-posta okuma ve AI extraction bu
fazın kapsamında **değil** — ajan çıktısı ileride de siparişi doğrudan
güncelleyemeyecek, yalnızca `pending_review` bir revizyon önerebilecek.
