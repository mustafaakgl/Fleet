-- Faz 18B — servis kaydina MUHASEBE onayi.
--
-- NEDEN: bu kolon eklenene kadar her `ServiceRecord` ortulu olarak "onayli
-- gercek gider" sayiliyordu. Ordivan'dan insan onayiyla dogan kayitla birinin
-- elle yazdigi kayit ayirt edilemiyordu; maliyet panosu ikisini de kesinmis
-- gibi topluyordu. Yakit fisinde Faz 7'den beri var olan kapinin AYNISI
-- servise de aciliyor — ikinci bir gider tablosu ACILMIYOR, onay kaydin
-- kendi uzerinde duruyor.
--
-- GERIYE DONUK DOLDURMA YOK — VE BU BILINCLI: var olan satirlar `pending`
-- olarak aciliyor. Toplu bir `UPDATE ... SET 'approved'`, hic yasanmamis bir
-- muhasebe onayini yasanmis gibi kaydetmek olurdu; imzasi, tarihi ve
-- sorumlusu olmayan bir onay, onay degildir. Satirlar KAYBOLMUYOR: maliyet
-- toplamina girmiyorlar ama "onay bekliyor" olarak ayri sayiliyor ve
-- tutarlariyla birlikte raporlaniyorlar.
CREATE TYPE "ServiceRecordApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE "ServiceRecord"
  ADD COLUMN "approvalStatus" "ServiceRecordApprovalStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "accountingNote" TEXT,
  ADD COLUMN "rejectionReason" TEXT;

-- Inceleyen kullanici silinirse kayit KALIR: denetim izi, aktoru artik
-- cozulemese bile kaybolmamali.
ALTER TABLE "ServiceRecord"
  ADD CONSTRAINT "ServiceRecord_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Muhasebe kuyrugunun canonical sorgusu: kiraci + onay durumu + tarih.
CREATE INDEX "ServiceRecord_tenantId_approvalStatus_date_idx"
  ON "ServiceRecord"("tenantId", "approvalStatus", "date");
