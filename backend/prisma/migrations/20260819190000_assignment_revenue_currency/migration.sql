-- fix: Assignment gelir para birimi guvenligi.
--
-- SORUN: `Assignment.expectedDailyRevenue` para birimi TASIMIYORDU. Repodaki
-- diger para alanlari (`FleetFuelEntry`, `ServiceRecord`, `Fine`) `currency`
-- tasiyor ve `matchesBaseCurrency` ile korunuyor; gelir korumasizdi ve
-- toplamlara KOSULSUZ giriyordu. Ayrica siparisin para birimi degistiginde
-- eski gorevin tutari sessizce yeni para biriminde okunur hale geliyordu.
--
-- BACKFILL KIRACININ KENDI TABANINDAN, SABIT `EUR` DEGIL: TRY tabanli bir
-- kiracinin gorevlerine `EUR` yazmak, denetimin duzeltmeye calistigi hatanin
-- ta kendisi olurdu.
--
-- FALLBACK YOK ve bilincli: `Assignment.tenantId` uzerinde FK var, yani her
-- satirin bir kiracisi var. Yine de bir satir bos kalirsa `SET NOT NULL`
-- SESSIZCE GECMEZ, migration duser. Sessiz bir `EUR` yazmaktansa gurultulu
-- bir hata iyidir.

-- 1) Once nullable ekle.
ALTER TABLE "Assignment" ADD COLUMN "currency" TEXT;

-- 2) Kiracinin KENDI temel para birimiyle doldur.
UPDATE "Assignment" AS a
SET "currency" = t."baseCurrency"
FROM "Tenant" AS t
WHERE a."tenantId" = t."id";

-- 3) Artik zorunlu.
ALTER TABLE "Assignment" ALTER COLUMN "currency" SET NOT NULL;

-- Toplama sorgularinin canonical yolu: kiraci + para birimi.
CREATE INDEX "Assignment_tenantId_currency_idx" ON "Assignment"("tenantId", "currency");
