import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FineStatus,
  InvoiceKind,
  OutgoingInvoiceStatus,
  ServiceRecordApprovalStatus,
} from '@prisma/client';
import {
  ACTUAL_REVENUE_INVOICE_STATUSES,
  assignmentRevenueRecognition,
  countsTowardAccountingTotal,
  DISPUTED_FINE_WHERE,
  disputedFineWhere,
  EFFECTIVE_FINE_COST_WHERE,
  EFFECTIVE_SERVICE_COST_WHERE,
  effectiveFineCostWhere,
  effectiveServiceCostWhere,
  fineRecognition,
  invoiceRevenueRecognition,
  invoiceRevenueSign,
  PENDING_SERVICE_COST_WHERE,
  pendingServiceCostWhere,
  serviceRecordRecognition,
} from './recognition';

/**
 * Tanima kurallari — TEK YERDE tanimli olduklari icin TEK YERDE de sinaniyor.
 *
 * Bu testler "hangi satir toplama girer" sorusunun cevabini kilitliyor.
 * Filtre nesnelerinin kendisi de siniyor: bir sorgu `effectiveServiceCostWhere`
 * yerine elle `{}` yazarsa derleme kirilmaz ama toplam sessizce yanlis olur.
 */

describe('tanima sinifi — servis kaydi', () => {
  it('yalnizca ONAYLI kayit muhasebe toplamina girer', () => {
    assert.equal(
      serviceRecordRecognition(ServiceRecordApprovalStatus.approved),
      'approved_actual',
    );
    assert.equal(countsTowardAccountingTotal('approved_actual'), true);
  });

  it('onay bekleyen kayit BEKLEYEN GERCEK: toplama girmez ama vardir', () => {
    assert.equal(serviceRecordRecognition(ServiceRecordApprovalStatus.pending), 'pending_actual');
    assert.equal(countsTowardAccountingTotal('pending_actual'), false);
  });

  it('reddedilen kayit toplamin tamamen disindadir', () => {
    assert.equal(serviceRecordRecognition(ServiceRecordApprovalStatus.rejected), 'rejected');
    assert.equal(countsTowardAccountingTotal('rejected'), false);
  });

  it('maliyet filtresi onay durumunu TASIR ve cagiran onu EZEMEZ', () => {
    assert.equal(
      EFFECTIVE_SERVICE_COST_WHERE.approvalStatus,
      ServiceRecordApprovalStatus.approved,
    );
    assert.equal(PENDING_SERVICE_COST_WHERE.approvalStatus, ServiceRecordApprovalStatus.pending);

    // Cagiran kendi `approvalStatus`unu gonderse bile kural KAZANIR: filtre
    // en sona yayiliyor. Aksi halde bir cagri, kapiyi sessizce acabilirdi.
    const where = effectiveServiceCostWhere({
      vehicleId: 'v1',
      approvalStatus: ServiceRecordApprovalStatus.pending,
    });
    assert.equal(where.approvalStatus, ServiceRecordApprovalStatus.approved);
    assert.equal(where.vehicleId, 'v1');

    assert.equal(
      pendingServiceCostWhere({ vehicleId: 'v1' }).approvalStatus,
      ServiceRecordApprovalStatus.pending,
    );
  });
});

describe('tanima sinifi — ceza', () => {
  it('ITIRAZ EDILMIS ceza ihtilaflidir ve gercek maliyete girmez', () => {
    assert.equal(fineRecognition(FineStatus.widerspruch), 'disputed');
    assert.equal(countsTowardAccountingTotal('disputed'), false);
  });

  it('itiraz edilmemis her ceza gercek giderdir', () => {
    for (const status of [
      FineStatus.neu,
      FineStatus.fahrer_zugeordnet,
      FineStatus.fahrer_benachrichtigt,
      FineStatus.bezahlt,
      FineStatus.abgeschlossen,
    ]) {
      assert.equal(fineRecognition(status), 'approved_actual', `beklenmedik sinif: ${status}`);
    }
  });

  it('maliyet ve ihtilaf filtreleri birbirinin TAM TERSI', () => {
    assert.deepEqual(EFFECTIVE_FINE_COST_WHERE.status, { not: FineStatus.widerspruch });
    assert.equal(DISPUTED_FINE_WHERE.status, FineStatus.widerspruch);

    // Cagiranin gonderdigi `status` kurali EZEMEZ.
    const where = effectiveFineCostWhere({ vehicleId: 'v1', status: FineStatus.widerspruch });
    assert.deepEqual(where.status, { not: FineStatus.widerspruch });
    assert.equal(disputedFineWhere({ vehicleId: 'v1' }).status, FineStatus.widerspruch);
  });
});

describe('tanima sinifi — gelir', () => {
  it('gorev geliri HER ZAMAN tahmindir ve muhasebe toplamina girmez', () => {
    assert.equal(assignmentRevenueRecognition(), 'forecast');
    assert.equal(countsTowardAccountingTotal('forecast'), false);
  });

  it('taslak fatura henuz kayit degildir', () => {
    assert.equal(
      invoiceRevenueRecognition(OutgoingInvoiceStatus.draft, InvoiceKind.invoice),
      'pending_actual',
    );
  });

  it('numara verilmis fatura tahsil edilmemis olsa da gercek gelirdir', () => {
    // `finalized` sinirinin iceride olmasi BILINCLI: fatura numarasi
    // verildigi anda belge hukuken olusmustur.
    for (const status of ACTUAL_REVENUE_INVOICE_STATUSES) {
      assert.equal(
        invoiceRevenueRecognition(status, InvoiceKind.invoice),
        'approved_actual',
        `beklenmedik sinif: ${status}`,
      );
    }
    assert.equal(ACTUAL_REVENUE_INVOICE_STATUSES.includes(OutgoingInvoiceStatus.draft), false);
    assert.equal(ACTUAL_REVENUE_INVOICE_STATUSES.includes(OutgoingInvoiceStatus.cancelled), false);
  });

  it('iptal edilmis fatura ve alacak dekontu ETKISIZDIR', () => {
    assert.equal(
      invoiceRevenueRecognition(OutgoingInvoiceStatus.cancelled, InvoiceKind.invoice),
      'reversed',
    );
    assert.equal(
      invoiceRevenueRecognition(OutgoingInvoiceStatus.sent, InvoiceKind.credit_note),
      'reversed',
    );
  });

  it('alacak dekontu ve iptal faturasi EKSI isaretle sayilir', () => {
    assert.equal(invoiceRevenueSign(InvoiceKind.invoice), 1);
    assert.equal(invoiceRevenueSign(InvoiceKind.credit_note), -1);
    assert.equal(invoiceRevenueSign(InvoiceKind.cancellation), -1);
  });
});

describe('pazarlik disi kural', () => {
  it('TAHMIN ile ONAYLI GERCEK ayni toplamda birlesemez', () => {
    // Toplama giren TEK sinif `approved_actual`. Bu test, ileride birinin
    // "forecast de sayilsin" demesini derleme degil ASSERT ile durduruyor.
    const classes = [
      'forecast',
      'pending_actual',
      'approved_actual',
      'disputed',
      'reversed',
      'rejected',
    ] as const;
    const counted = classes.filter((item) => countsTowardAccountingTotal(item));
    assert.deepEqual(counted, ['approved_actual']);
  });
});
