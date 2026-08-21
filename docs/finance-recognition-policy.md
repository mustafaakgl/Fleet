# Finance Hub — Recognition Policy (Faz 18A)

> Bu belge bir SINIFLANDIRMA ONERISIDIR. Enum'lar semaya **eklenmedi**;
> asagida mevcut status alanlariyla nasil eslesecekleri belgeleniyor.
>
> Denetim SHA: `9a7da9d`

---

## 1. Sinifi

| Sinif | Anlam | Muhasebe toplamina girer mi |
|---|---|---|
| `forecast` | Planlama tahmini | **Hayir** |
| `commitment` | Siparis/sozlesme taahhudu | Hayir (ayri gosterilir) |
| `pending_actual` | Gercek belge var, onaylanmadi | **Hayir** (ayri sayilir) |
| `approved_actual` | Onayli gercek gelir/gider | **Evet** |
| `reversed` | Ters kayda alinmis | **Hayir** (etkisiz) |
| `accounting_exported` | DATEV/Lexware paketine alinmis | Evet + kilitli |

**`forecast` ile `approved_actual` ASLA ayni toplamda birlesmez.** Bu, Faz 18'in
tek pazarlik disi kurali.

## 2. Sinif TURETILIR, SAKLANMAZ

`effective-fuel-cost.ts` bunu zaten dogru yapiyor:

> "Turetilmis durum bu yuzden ayri bir alan olarak DONUYOR, veritabanina ikinci
> bir durum kolonu yazilmiyor: iki kolon er ya da gec birbirinden ayrilirdi."

Faz 18 bu ilkeyi korumali. `RecognitionClass` bir **fonksiyon ciktisi** olmali,
yeni bir kolon degil.

## 3. Mevcut alanlarla esleme

### 3.1 Yakit — `FleetFuelEntry` (referans, DEGISIKLIK GEREKMIYOR)

| Mevcut | Sinif |
|---|---|
| `driver_review` | `pending_actual` |
| `submitted` | `pending_actual` |
| `approved` + `reversal is null` | `approved_actual` |
| `approved` + reversal var | `reversed` |
| `rejected` | (disarida) |

`effectiveAccountingStatus()` bu esleme icin hazir; yalnizca adlandirma
koprusu gerekiyor.

### 3.2 Giden fatura — `Invoice`

| `OutgoingInvoiceStatus` | Sinif |
|---|---|
| `draft` | `pending_actual` |
| `finalized`, `sent`, `partially_paid`, `paid`, `overdue` | `approved_actual` |
| `cancelled` | `reversed` |
| `kind = credit_note \| cancellation` | `reversed` (isaret ters) |
| `DatevExport`e girmis | `accounting_exported` |

`finalized` sinirinin `approved_actual` olmasi bilincli: fatura numarasi
verildigi anda kayit hukuken olusmustur.

### 3.3 Servis kaydi — `ServiceRecord` (**ACIK**)

Bugun durum alani YOK → hepsi ortulu `approved_actual`. Ordivan yolundan
gelenler insan onayindan geciyor, elle girilenler gecmiyor; ikisi ayirt
edilemiyor.

**Oneri (additive migration):** `approvalStatus` + `ServiceRecordReversal`,
yakit deseniyle birebir.

### 3.4 Ceza — `Fine` (**ACIK**)

`FineStatus` operasyonel; muhasebe anlami tasimiyor. `widerspruch` (itiraz)
bugun maliyete giriyor.

**Oneri:** `widerspruch` → `pending_actual`; `bezahlt`/`abgeschlossen` →
`approved_actual`. Migration gerektirmez, yalnizca sorgu filtresi.

### 3.5 Gorev geliri — `Assignment.expectedDailyRevenue`

Adi "expected" — **`forecast`**. `TransportOrder.contractedRevenue` ise
**`commitment`**. Fatura satiri olustugunda `approved_actual`.

Bugun maliyet panosu `expectedDailyRevenue`'yu `revenue` olarak topluyor:
**tahmin ile gerceklesen karisiyor.** Faz 18B'nin ilk duzeltmesi bu olmali.

### 3.6 Rota ve tur tahminleri

`Tour.plannedTollCents`, `plannedFuelLiters`, `DispatchProposal.*`,
`FuelingIntent.quotedPricePerLitre` → hepsi **`forecast`**. Hicbiri bugun
muhasebe toplamina girmiyor; bu korunmali.

---

## 4. Yakit icin zorunlu kural (sartname §4 karsiligi)

| Kural | Bugunku durum |
|---|---|
| Rota tahmini muhasebe toplamina giremez | ✅ `FuelingIntent` toplamda yok |
| Onayli fis/kart islemi gercek gider | ✅ `approved` |
| Bekleyen/reddedilen toplama girmez | ✅ ayri sayiliyor |
| Reversed etkisiz | ✅ `reversal: { is: null }` |
| Fisin tur sirasinda alinmasi tuketimi KANITLAMAZ | ⚠️ belgelenmeli |
| Fis tura bagliysa → `purchase context` | ❌ terim yok |
| "Gercek tur yakit maliyeti" ancak guvenilir litre ile | ⚠️ kismen |
| Bilinmiyorsa sifir/tahmin gosterme → `unknown` | ⚠️ UI'da tutarsiz |
| FX yoksa farkli para birimlerini toplama | ✅ base disi disarida (sessiz) |

**`purchase context` tanimi (yeni terim, kod degil):** bir yakit fisinin bir
tura baglanmasi, o yakitin o turda TUKETILDIGINI degil, o tur baglaminda
SATIN ALINDIGINI ifade eder. Depoya alinan yakit birden fazla tura yayilir.
Tur basina tuketim maliyeti ancak olculmus litre verisi varsa hesaplanabilir;
yoksa UI **`unknown`** gostermeli — sifir ya da tahmin DEGIL.

---

## 5. E-fatura siniri

### 5.1 Mevcut olan (KANIT)

`src/invoicing/einvoice/`:
- `cii-xml.ts` — EN 16931 CII (ZUGFeRD 2.3 / Factur-X, COMFORT profili)
- `ubl-xml.ts` — UBL (XRechnung)
- `document-model.ts` — canonical belge modeli
- `pdf-renderer.ts` — PDF
- `__golden__/cii-en16931.xml`, `__golden__/ubl-xrechnung.xml`
- `EInvoicePreference` = `zugferd | xrechnung | both`; `requiresCii()`,
  `requiresUbl()`

**Sonuc: paralel invoice modeli GEREKMIYOR ve onerilmiyor.** Hedefler mevcut
`Invoice` uzerinde additive olarak karsilanabilir.

### 5.2 Faz 18'de eklenecekler

| Hedef | Durum |
|---|---|
| EN 16931 canonical veri | ✅ var |
| XRechnung (UBL) | ✅ var |
| ZUGFeRD (CII+PDF) | ✅ var |
| Surumlu format adapter'lari | ⚠️ surum alani yok — **additive** |
| XML/schema/business-rule validation | ❌ golden test var, **schematron/BR yok** |
| Credit note / reversal | ✅ `InvoiceKind` + `originalInvoiceId` |
| Siparis → teslimat/POD → fatura | ❌ **POD bagli degil** |
| Insan onayi olmadan gonderim yok | ✅ `finalized` + `InvoiceDeliveryAttempt` |

### 5.3 Iki kesin sinir

1. **Taranmis tedarikci PDF'i geriye donuk orijinal e-fatura SAYILAMAZ.**
   OCR ciktisi yalnizca **yapilandirilmis muhasebe taslagi** uretir; orijinal
   belge PDF olarak kalir. Aksi, olmayan bir yapilandirilmis fatura uydurmak
   olurdu.
2. **Bordro e-fatura olarak MODELLENMEZ.** Farkli hukuki rejim, farkli alici,
   farkli ihracat yolu. `PayrollExport` ayri kalir.

---

## 6. Acik kararlar

| # | Karar | Durum |
|---|---|---|
| AK-1 | `ServiceRecord` onay akisi eklensin mi, yoksa ayri `SupplierInvoice` mi | **KAPANDI (Faz 18B)** — `ServiceRecord` genisletildi; `SupplierInvoice` ACILMADI |
| AK-2 | `Fine.widerspruch` maliyetten cikarilsin mi | **KAPANDI (Faz 18B)** — cikarildi, "ihtilafli" olarak ayri gosteriliyor |
| AK-3 | `ServiceRecord.currency` `@default("EUR")` kaldirilsin mi | ACIK — sessiz varsayim duruyor; `Assignment.currency` varsayilansiz |
| AK-4 | FX destegi Faz 18 kapsaminda mi | **KAPANDI (Faz 18B)** — kapsam DISI; base disi tutarlar her ekranda "toplanmadi" diye gorunuyor |
| AK-5 | POD/CMR belge turu gelen kutusuna acilsin mi | ACIK — `assessBilling` bunu bekliyor; bugun acikca kapali |
| AK-6 | `accounting_exported` kilit mi yoksa etiket mi | ACIK — ihracattan sonra duzeltme politikasi |

## 6.1 Faz 18B'de uygulananlar (KOD)

Bu belge Faz 18A'da bir ONERIYDI. Asagidakiler artik kodda:

| Kural | Nerede |
|---|---|
| `RecognitionClass` TURETILMIS fonksiyon ciktisi, kolon degil | `backend/src/common/finance/recognition.ts` |
| Servis: yalnizca `approved` maliyete girer | `effectiveServiceCostWhere` |
| Servis: onay bekleyen AYRI sayilir, toplamda degil | `pendingServiceCostWhere` |
| Ceza: `widerspruch` gercek maliyette DEGIL | `effectiveFineCostWhere` / `disputedFineWhere` |
| Gelir: tahmin (`Assignment`) ile gerceklesen (`Invoice`) AYRI | `ActualRevenueService` + `estimatedRevenue`/`actualRevenue` alanlari |
| Marj yalnizca GERCEK gelirden; fatura yoksa `unknown` | `cost-dashboard.service.ts`, `dashboard.service.ts` |
| Farkli para birimleri toplanmaz ve SESSIZCE dusmez | `unconvertedByCurrency` (yakit + servis + ceza + gelir) |
| Office finansal alan gormez | `SENSITIVE_FINANCIAL_KEYS` + `@Roles(...FINANCIAL_ROLES)` |

**Migration:** `20260821120000_faz18b_service_record_approval` — additive.
Var olan `ServiceRecord` satirlari `pending` acildi ve GERIYE DONUK
ONAYLANMADI: imzasi, tarihi ve sorumlusu olmayan bir onay, onay degildir.
Bu satirlar kaybolmuyor — "onay bekliyor" olarak tutarlariyla raporlaniyor.

**Yapilmayanlar (bilincli):** paralel maliyet/fatura modeli YOK, e-fatura
uclari ve `/finance/*` ekranlari (Faz 18C) BU FAZDA ACILMADI.

## 7. Pilot sirketten gereken acik girdiler

**DATEV muhasebe:** urun surumu, SKR03 mu SKR04 mu, danisman/mandant numarasi,
gelir hesaplari (mevcut `TenantBillingProfile.revenueAccount*` doldurulmali),
ornek EXTF import dosyasi.

**Bordro (Lexware Lohn+Gehalt Plus / DATEV):** urun surumu, Lohnarten
numaralari (dokuz kategori), Kostenstelle kullanimi, personel numarasi bicimi,
saat ondalik mi HH:MM mi, negatif miktar kabul ediliyor mu, **anonimlestirilmis
ornek ASCII dosyasi + import semasi**.

> Bu girdiler gelmeden `datev_ascii` / `lexware_ascii` yazicilari
> **yazilmayacak**. Dogrulanmamis kolon sirasi uydurmak, sessizce yanlis bordro
> uretmenin en hizli yoludur.
