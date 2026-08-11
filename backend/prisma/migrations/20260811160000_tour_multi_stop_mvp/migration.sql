-- Cok duraklu tur MVP'si: serbest duraklar, bacak dokumu ve ETA.
--
-- Bugune kadar tur yalnizca gorevlerden kurulabiliyordu (her gorev bir alis +
-- bir teslim). Dispatcher'in elle adres girip 8-9 duraklu bir gun planlamasi
-- mumkun degildi. Ayrica plannedArrivalAt/legDistanceKm alanlari sema'da
-- duruyor ama hicbir yerde YAZILMIYORDU — surucu ucu bos alan donduruyordu.
--
-- Yeni model yok, mevcut Tour/TourStop genisletiliyor: paralel bir rota
-- sistemi kurmamak icin bilincli tercih.

-- CreateEnum degerleri
-- waypoint: gorevden turemeyen serbest durak (alis-teslim kisitina tabi degil)
-- service : yuk disi is (atolye, muayene) — sirasi optimize edilir
ALTER TYPE "TourStopKind" ADD VALUE 'waypoint';
ALTER TYPE "TourStopKind" ADD VALUE 'service';

-- AlterTable
-- plannedStartAt ETA'nin dayanagi; olmadan bacak sureleri hesaplanir ama
-- mutlak varis saati uretilemez.
ALTER TABLE "Tour" ADD COLUMN "plannedStartAt" TIMESTAMP(3);
ALTER TABLE "Tour" ADD COLUMN "plannedEndAt" TIMESTAMP(3);

-- AlterTable
-- Bacak govdesi durak basina tutuluyor: tur duzeyinde tek govde olsaydi
-- haritada tek bir bacak vurgulanamazdi.
ALTER TABLE "TourStop" ADD COLUMN "legShape" TEXT;
