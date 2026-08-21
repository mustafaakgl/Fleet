# Finance Hub — Canonical Domain Mapping (Faz 18A)

> **Bu belge kod degil, KANIT.** Faz 18A'da uygulama kodu, Prisma semasi ve
> migration YAZILMADI. Amac, Faz 18B'nin paralel bir fatura/maliyet sistemi
> kurmasini ONLEMEK: her parasal alanin nerede dogdugu, nerede degistigi,
> nerede ters kayda alindigi ve hangi raporda toplandigi burada yaziyor.
>
> Denetim SHA: `9a7da9d`

---

## 0. Ozet — en onemli uc bulgu

1. **E-fatura altyapisi ZATEN VAR.** `src/invoicing/einvoice/` altinda EN 16931
   CII (ZUGFeRD/Factur-X), UBL (XRechnung), PDF/A rendarlayici ve iki golden
   test dosyasi bulunuyor. Faz 18 icin "e-fatura kuralim" DEGIL, "mevcut olani
   sozlesmeye baglayalim" gecerli. Paralel bir Invoice modeli GEREKMIYOR ve
   kurulmamali.
2. **Tanima (recognition) semantigi yakitta ZATEN dogru kurulmus** ve
   `effectiveAccountingStatus` ile TURETILMIS bir durum olarak yasiyor. Faz
   18'in yapmasi gereken, bu deseni digier gider kaynaklarina YAYMAK — yeni bir
   durum kolonu eklemek degil.
3. **En buyuk acik: gider tarafinda onay kapisi yakita OZEL.** `ServiceRecord`
   ve `Fine` hicbir onay/ters kayit filtresi olmadan arac maliyetine
   toplaniyor. Ayrica `Assignment.expectedDailyRevenue` bir TAHMIN oldugu halde
   maliyet panosunda gelir olarak gosteriliyor.

---

## 1. Canonical modeller — parasal alanin sahibi kim

### 1.1 Giden fatura (satis)

| Model | Rol | Parasal alanlar |
|---|---|---|
| `Invoice` | Canonical giden fatura | `netCents`, `taxCents`, `grossCents`, `paidCents`, `currency`, `taxBreakdown` |
| `InvoiceLine` | Fatura satiri | `quantity`, `unitPriceCents`, `taxRateBasisPoints`, `netCents`, `taxCents`, `grossCents` |
| `InvoicePayment` | Tahsilat | `amountCents`, `paidAt` |
| `InvoiceAssignmentClaim` | Bir `Assignment`in EN FAZLA BIR satira baglanmasi | — (tekillik tasiyicisi) |
| `RateCardItem` | Fiyat listesi | `unitPriceCents`, `taxRateBasisPoints` |
| `DunningNotice` | Hatirlatma | `feeCents` |
| `InvoiceAuditEvent`, `InvoiceDeliveryAttempt` | Iz ve gonderim denemesi | — |
| `TenantBillingProfile` | Kiraci fatura ayarlari | `defaultTaxRateBasisPoints`, `dunningLevel{1,2,3}FeeCents`, `revenueAccount19/7/0/ReverseCharge` |

**Tutarlar `Int` cents.** `Decimal` DEGIL. Yeni satis tarafi alanlari da cents
olmali; iki birim karisirsa yuvarlama farki faturaya girer.

`OutgoingInvoiceStatus`: `draft → finalized → sent → partially_paid → paid →
overdue`, ayrica `cancelled`. `InvoiceKind`: `invoice | credit_note |
cancellation` — **credit note/reversal zaten modelde**, `originalInvoiceId`
ile orijinaline bagli.

### 1.2 Operasyon → fatura koprusu

`TransportOrder` (`contractedRevenue`, `currency`, `billingMode`) →
`Consignment` → `Assignment` (`expectedDailyRevenue`, `currency`) →
`InvoiceAssignmentClaim` → `InvoiceLine`.

`Tour`/`TourStop` fatura zincirinde DEGIL; planlama tarafinda duruyor
(`plannedDistanceKm`, `plannedFuelLiters`, `plannedTollCents`).

### 1.3 Gider kaynaklari

| Kaynak | Onay akisi | Ters kayit | Maliyete girme kurali |
|---|---|---|---|
| `FleetFuelEntry` | `FuelEntryWorkflowStatus`: `driver_review → submitted → approved \| rejected` | `FleetFuelEntryReversal` (append-only) | **`effectiveFuelCostWhere`** — tek yer |
| `FuelCardTransaction` | `imported → matched \| disputed \| ignored` | — | Yakit fisine eslestirilerek |
| `ServiceRecord` | **YOK** (kayit dogrudan var) | **YOK** | Filtresiz toplaniyor |
| `Fine` | `FineStatus` operasyonel (`neu…abgeschlossen`) | **YOK** | Filtresiz toplaniyor |
| `Accident.damageValue` | — | — | Maliyet panosunda YOK |
| `FuelingIntent` | `FuelingIntentStatus` | — | **Toplama girmiyor (dogru)** |

### 1.4 Bordro

`PayrollPeriod` / `PayrollEntry` / `PayrollDay` / `DriverPayrollProfile` /
`PayrollWageTypeMapping`. Hedef: `PayrollTargetSystem` =
`datev_lodas | datev_lohn_und_gehalt | lexware_lohn_und_gehalt`.
Uretilen bicim: `PayrollExportFormat` = `neutral_csv | datev_ascii |
lexware_ascii` — bugun **yalnizca `neutral_csv` uygulanmis**
(`src/payroll/export/neutral-csv.ts`); ASCII yazicilar YOK.

### 1.5 Muhasebe disari aktarim

`DatevExport` + `src/invoicing/datev/extf.ts` — **giden faturalar icin** EXTF
buchungsstapel. `DatevExtfProfile` danisman/mandant numarasi tasiyor.
Bordro ihracati AYRI yol (`src/payroll/export/`).

---

## 2. Tekrar / cakisma riskleri

| Risk | Kanit | Karar |
|---|---|---|
| Paralel Invoice modeli | `Invoice` + `InvoiceLine` + e-fatura + DATEV zaten tam | **YASAK.** Mevcut model GENISLETILIR |
| Paralel yakit gideri modeli | `FleetFuelEntry` yorumu bunu acikca reddediyor | **YASAK** |
| Ikinci bir "muhasebe durumu" kolonu | `effectiveAccountingStatus` TURETILMIS | **YASAK.** Turetilmis kalmali |
| Tedarikci faturasi icin yeni model | `ServiceRecord` + Ordivan `service_invoice.draft` var | Once `ServiceRecord` genisletilmeli |
| Maliyet toplamlarinin ikinci kopyasi | `effectiveFuelCostWhere` tek kaynak | Ayni desen digier kaynaklara |

---

## 3. Parasal alan yasam dongusu — nerede olusur / degisir / ters alinir / toplanir

### Yakit (referans desen — DOGRU)
- **Olusur:** surucu fisi yukler → OCR taslagi → `driver_review`
- **Degisir:** surucu dogrular → `submitted`; muhasebe → `approved | rejected`
- **Ters alinir:** `FleetFuelEntryReversal` — satir SILINMEZ
- **Toplanir:** `effectiveFuelCostWhere` = `approved` **ve** `reversal is null`
- **Donem olcutu:** `enteredAt` (gercek alim tarihi), `reviewedAt` DEGIL

### Servis kaydi (EKSIK)
- **Olusur:** elle ya da Ordivan `service_invoice.draft` onayindan
- **Degisir:** dogrudan guncelleme
- **Ters alinir:** **yol yok**
- **Toplanir:** `dashboard.service.ts` — **status filtresi YOK**

### Ceza (EKSIK)
- **Toplanir:** filtresiz. `widerspruch` (itiraz edilmis) ceza da maliyete giriyor

### Gorev geliri (YANLIS SINIFTA)
- `Assignment.expectedDailyRevenue` bir **tahmin**; maliyet panosunda
  `revenue` olarak gosteriliyor ve `completed` + `in_progress` gorevleri
  topluyor

---

## 4. Cok para birimi ve zaman dilimi

- `Tenant.baseCurrency` canonical; `Tenant.timezone` var.
- **FX altyapisi YOK** — `exchangeRate`/`fxRate` alani hicbir modelde yok.
- Maliyet panosu bunu DOGRU ele aliyor: yalnizca base currency'deki onayli
  yakit toplaniyor, digerleri disarida. Bu davranis Faz 18'de korunmali ve
  **UI'da acikca gosterilmeli** (bugun sessiz).
- `Assignment.currency` varsayilansiz (dogru). **`ServiceRecord.currency` ise
  `@default("EUR")`** — sessiz varsayim, acik karar konusu (bkz. AK-3).

---

## 5. Belge girisi / OCR / Ordivan

`IntakeDocument` → `AutomationJob` → `AutomationProposal`
(`service_invoice.draft`) → insan onayi → **canonical `ServiceRecord`**.
`AutomationProposal.resultServiceRecordId` `@unique` — bir oneri EN FAZLA BIR
kayit uretir.

**CMR/POD kapsam disi:** `document-type-registry.ts` `cmr`, `pod` ve
`driver_health` turlerini acikca reddediyor; `document-inbox.spec.ts` bunu
test ediyor.

---

## 6. Roller ve write guard'lari

| Grup | Uyeler |
|---|---|
| `OPERATIONAL_ROLES` | admin, boss, accounting, office |
| `OPERATIONAL_WRITE_ROLES` | admin, boss, office |
| `FINANCIAL_ROLES` | admin, boss, accounting |
| `INVOICING_ROLES` | admin, boss, accounting, **office** |
| `AUTOMATION_ROLES` | admin, boss |

`INVOICING_ROLES` office'i ICERIR ama `FINANCIAL_ROLES` ICERMEZ — cunku
ikincisi bordro ve abonelik verisini de koruyor. **Bu ayrim Faz 18'de
korunmali.**

Sunucu tarafi maskeleme mevcut: `maskFinancialFields`, `maskOrderFinancials`,
`maskDispatchFinancials`, `order-intake-field-security`.

---

## 7. Faz 18B uygulama sirasi (onerilen)

1. **Migration gerektirmeyen** — tanima politikasinin yayilmasi:
   `effectiveServiceCostWhere` / `effectiveFineCostWhere` yardimcilari,
   maliyet panosunda tahmin/gerceklesen ayrimi, UI etiketleri.
2. **Additive migration** — `ServiceRecord`'a onay/ters kayit alanlari,
   `Invoice`'a e-fatura cikti alanlari (bkz. recognition policy).
3. **Sozlesme isi** — XRechnung/ZUGFeRD dogrulayicisinin CI'ya baglanmasi.
4. **Pilot girdisi bekleyen** — DATEV/Lexware ASCII yazicilari.

---

## 8. Migration gerektiren / gerektirmeyen

**Gerektirmeyen:** tanima yardimcilari, UI ayrimi, maskeleme, rapor
filtreleri, e-fatura XML uretiminin uca baglanmasi.

**Gerektiren (additive):** `ServiceRecord` onay durumu + ters kayit modeli,
`Invoice` uzerinde e-fatura cikti izleri, `SupplierInvoice` alanlari (eger
`ServiceRecord` genisletme yetmezse — once denenmeli), FX alanlari (eger cok
para birimi hedeflenirse).

**Karar bekleyen:** bkz. `finance-recognition-policy.md` §6.
