# Finance Hub — UI Information Architecture (Faz 18A)

> Tasarim onerisi. Faz 18A'da hicbir ekran KODLANMADI.
> Denetim SHA: `9a7da9d`

---

## 1. Mevcut durum

Bugun finans dort ayri yerde: `/invoicing`, `/payroll`, `/costs`, `/billing`
(Stripe abonelik — **finans degil, urun aboneligi**; Hub'a TASINMAZ).

`nav-access.ts` mevcut haklar:

| Rota | Roller |
|---|---|
| `/invoicing` | admin, boss, accounting, office |
| `/payroll` | admin, boss, accounting |
| `/costs` | admin, boss, accounting |
| `/billing` | admin |

## 2. Rol modeli — office sizintisi

`INVOICING_ROLES` office'i ICERIR, `FINANCIAL_ROLES` ICERMEZ. Sebep kodda
yaziyor: ikinci grup bordro ve abonelik verisini de koruyor. **Faz 18 bu
ayrimi korumali.**

| Ekran | Roller | Office ne gorur |
|---|---|---|
| `/finance` | admin, boss, accounting | **Erisim yok** |
| `/finance/inbox` | admin, boss, accounting | Erisim yok |
| `/finance/sales-invoices` | admin, boss, accounting, **office** | Fatura kesebilir; **bordro/abonelik gormez** |
| `/finance/expenses` | admin, boss, accounting | Erisim yok |
| `/finance/payroll` | admin, boss, accounting | **Erisim yok** |
| `/finance/reconciliation` | admin, boss, accounting | Erisim yok |
| `/finance/exports` | admin, boss, accounting | Erisim yok |
| `/finance/settings` | admin | Erisim yok |

> **Office sizintisi kurali:** office'e finansal veri istemcide gizlenmez,
> **sunucudan hic gonderilmez** — Faz 15/16/17'de kurulan desen (`maskOrderFinancials`,
> `maskDispatchFinancials`). `/finance` kok ekrani office'e hic acilmaz;
> `nav-access.ts` + controller `@Roles` birlikte degismeli.

## 3. Ekranlar

### `/finance` — genel bakis
- **Kaynak:** `Invoice`, `effectiveFuelCostWhere`, `ServiceRecord`, `Fine`, `PayrollPeriod`
- **Ana aksiyon:** drill-down
- **Durumlar:** donem secimi; **her kart sinifini yazar** (`approved_actual` / `pending_actual`)
- **Kritik:** tahmin ile gerceklesen AYNI kartta toplanmaz
- **Drill-down:** her kart kendi ekranina

### `/finance/inbox` — gelen belgeler
- **Kaynak:** `IntakeDocument` → `AutomationProposal` (`service_invoice.draft`)
- **Aksiyon:** onayla / reddet / duzelt → canonical `ServiceRecord`
- **Durumlar:** `pending_review`, `approved`, `rejected`, `expired`
- **Uyari:** taranmis PDF **orijinal e-fatura DEGIL** — ekran bunu acikca yazar
- **Drill-down:** ham belge (indirme, `nosniff`), uretilen `ServiceRecord`

### `/finance/sales-invoices`
- **Kaynak:** `Invoice`, `InvoiceLine`, `InvoicePayment`, `DunningNotice`
- **Aksiyon:** taslak → finalize → gonder → tahsilat; credit note
- **Durumlar:** `OutgoingInvoiceStatus` + `InvoiceKind`
- **Kritik:** `finalized` oncesi **insan onayi**; gonderim `InvoiceDeliveryAttempt`'e yazilir
- **Drill-down:** `TransportOrder` / `Assignment` (`InvoiceAssignmentClaim`), ZUGFeRD/XRechnung ciktisi

### `/finance/expenses`
- **Kaynak:** `FleetFuelEntry` (+reversal), `FuelCardTransaction`, `ServiceRecord`, `Fine`
- **Aksiyon:** onay/red, ters kayit
- **Durumlar:** `effectiveAccountingStatus` — tek fonksiyon, her ekranda ayni
- **Kritik:** bekleyenler **ayri sayilir, toplama girmez**; base disi para birimi **"toplanmadi" diye gorunur**
- **Drill-down:** arac, surucu, tur (**`purchase context` — tuketim kaniti degil**)

### `/finance/payroll`
- **Kaynak:** `PayrollPeriod`, `PayrollEntry`, `PayrollDay`, `DriverPayrollProfile`
- **Aksiyon:** donem kapat, neutral CSV uret
- **Durumlar:** `draft → review → approved → exported → locked`
- **Kritik:** **e-fatura DEGIL**; ASCII yazicilari pilot girdisi bekliyor — ekran bunu yazar
- **Drill-down:** surucu, calisma suresi, izin

### `/finance/reconciliation`
- **Kaynak:** `FuelReconciliation`, `FuelCardTransaction` ↔ `FleetFuelEntry`, `InvoicePayment` ↔ `Invoice`
- **Aksiyon:** eslestir, itiraz, yok say
- **Durumlar:** `imported | matched | disputed | ignored`
- **Kritik:** mutabakat **basarisiz olsa bile** onayli fis maliyette kalir
- **Drill-down:** iki tarafin kaydi

### `/finance/exports`
- **Kaynak:** `DatevExport`, `PayrollExport`
- **Aksiyon:** paket uret, indir
- **Durumlar:** `generated | downloaded`; `accounting_exported` isareti
- **Kritik:** **muhasebe ve bordro ihracati AYRI listeler** — karistirilmaz
- **Drill-down:** pakete giren kayitlar

### `/finance/settings` — yalnizca admin
- **Kaynak:** `TenantBillingProfile`, `PayrollWageTypeMapping`, `RateCardItem`, `Tenant.baseCurrency`
- **Kritik:** SKR hesaplari, Lohnarten, danisman/mandant — **bos alan "0" degil "girilmemis"**

## 4. Gercek veri ile tahminin ayrilmasi

Faz 17'de kurulan desen aynen: **renk tek basina anlam tasimaz**, ikon + metin
birlikte.

| Sinif | Gosterim |
|---|---|
| `approved_actual` | Normal tutar |
| `pending_actual` | Tutar + "onay bekliyor" rozeti, **toplamda degil** |
| `forecast` | "Tahmin" rozeti, **ayri satir**, muhasebe toplamina girmez |
| `commitment` | "Taahhut" rozeti |
| `reversed` | Ustu cizili + "ters kayit" |
| `accounting_exported` | Kilit ikonu |
| Olculemeyen | **`unknown`** — sifir ya da tire DEGIL |

**Toplam satirlari yalnizca `approved_actual` icerir** ve altinda "X bekleyen
kayit toplama dahil degil" satiri gosterir.

## 5. Navigasyon

`getNavigationForRole` icinde `heute` grubuna DEGIL, ayri bir **Finance**
bolumune. `/billing` (Stripe) admin altinda kalir — urun aboneligi, filo
finansi degil.

`nav-access.ts` ve `navigation.ts` **birlikte** guncellenir; `nav-access.spec.ts`
kesisimi zorunlu kiliyor.

## 6. Faz 18B sirasi

1. `/finance` kok + `/finance/expenses` (mevcut veriye dayaniyor, migration yok)
2. `/finance/sales-invoices` (mevcut `Invoice` + e-fatura ciktisi)
3. `/finance/exports` (mevcut `DatevExport` + `PayrollExport`)
4. `/finance/inbox` (mevcut Ordivan akisi)
5. `/finance/reconciliation`
6. `/finance/payroll` (pilot girdisi bekliyor)
7. `/finance/settings`
