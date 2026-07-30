# Kanıt: Fatura editörü, detay görüntüleyici ve fatura profili ekranı

## Kapsam
- `/invoicing/invoices/new` — taslak oluşturma (müşteri, hizmet dönemi, satır içi satır editörü, canlı toplam paneli)
- `/invoicing/invoices/[id]` — DRAFT ise editör (satır CRUD + başlık formu + "Kesinleştir" onay modalı,
  metin: "Bu işlem geri alınamaz, düzeltme sadece storno ile mümkündür"), FINALIZED ise salt okunur
  görüntüleyici (PDF önizleme, Gönder / Ödeme kaydet / Storno / Gutschrift / PDF / XML, ödeme geçmişi,
  Mahnung geçmişi kademe rozetleriyle, gönderim kaydı)
- `/settings/billing-profile` — GET/PUT `/invoicing/billing-profile` bağlandı; firma, banka, numara formatı
  (canlı önizleme `RE-2026-00001`), ödeme vadesi, Mahnung ayarları, katlanır "Gelişmiş: vergi hesapları (DATEV/SKR)"

## Backend eklemeleri (kullanıcı onayıyla, kapsam genişletmesi)
- `POST /invoicing/invoices/:id/lines`, `PATCH .../lines/:lineId`, `DELETE .../lines/:lineId`
  (yalnızca DRAFT; pozisyon yeniden numaralama + toplam yeniden hesaplama + audit event tek transaction içinde)
- `UpdateInvoiceLineDto` (yeni), `UpsertBillingProfileDto` DATEV/SKR alanlarıyla genişletildi
- `invoicing-draft-lines.spec.ts` (7 test)

## Bilinçli sınır
Storno ve Gutschrift butonları **disabled** render ediliyor (`invoicing.detail.notAvailableYet`),
çünkü backend'de karşılık gelen endpoint yok. Kullanıcı kararı.

## Doğrulama çıktıları

### frontend
```
npm run lint   -> ✖ 25 problems (0 errors, 25 warnings)   # tamamı mevcut/eski uyarılar
npm run verify -> i18n-check passed
                  tsc --noEmit temiz
                  next build başarılı (/settings/billing-profile 9.16 kB,
                  /invoicing/invoices/new, /invoicing/invoices/[id] derlendi)
```

### backend
```
npx tsc -p tsconfig.json --noEmit   -> temiz
npm test                            -> tests 358 / pass 358 / fail 0 (spec_files=79)
npx ts-node scripts/tenant-isolation-check.ts -> Tenant isolation check passed.
```

## i18n
~145 yeni anahtar de/en/tr üçlüsüne eşit anahtar kümesiyle eklendi
(`invoicing.unit.*`, `invoicing.taxPreset.*`, `invoicing.taxCategory.*`, `invoicing.paymentMethod.*`,
`invoicing.editor.*`, `invoicing.detail.*`, `invoicing.new.*`, `invoicing.billingProfile.*`).
