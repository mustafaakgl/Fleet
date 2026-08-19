-- Faz 16 — ham `.eml` zarfi icin ayri blob turu.
--
-- TAMAMEN EKLEMELI: yalnizca enum'a bir deger ekleniyor. Mevcut
-- `service_invoice` ve `document_intake` degerleri DOKUNULMADAN kaliyor ve
-- hicbir satir guncellenmiyor.
--
-- Deger bu migration icinde KULLANILMIYOR: PostgreSQL ayni islemde eklenen
-- bir enum degerinin kullanilmasina izin vermez ve gerek de yok — geriye
-- donuk hicbir blob zarf degil.

-- AlterEnum
ALTER TYPE "AutomationDocumentKind" ADD VALUE 'order_intake';
