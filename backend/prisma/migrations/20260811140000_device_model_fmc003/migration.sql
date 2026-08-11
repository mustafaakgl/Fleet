-- FMC003: OBD-II soketine takilan Teltonika dongle'i.
--
-- Enum'da karsiligi olmadan cihaz kaydedilemiyordu; kayit olmayinca da ag
-- gecidi IMEI el sikismasini reddediyor (teltonika-gateway.service.ts,
-- resolveDeviceBinding). Yani bu satir olmadan cihaz hic baglanamaz.
--
-- IO eslemesi ana unitelerden ayri: ayni AVL ID bu cihazda baska anlama
-- geliyor (32 = sogutucu sicakligi, ana unitede devir).

-- AlterEnum
ALTER TYPE "DeviceModel" ADD VALUE 'FMC003';
