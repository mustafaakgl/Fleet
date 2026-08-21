import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { DashboardController } from '../../dashboard/dashboard.controller';
import {
  canViewFinancialFields,
  FINANCIAL_ROLES,
  INVOICING_ROLES,
  maskFinancialFields,
} from './permissions';

/**
 * OFFICE FINANSAL ALAN GORMEZ.
 *
 * Maskeleme ISTEMCIDE DEGIL SUNUCUDA: alan office'e hic gonderilmiyor.
 * Bu test alan adlarini TEK TEK siniyor cunku eksik bir maskeleme HATA
 * VERMEZ — sadece office bir tutari gorur ve kimse fark etmez.
 */

describe('office maskelemesi — rol siniri', () => {
  it('office finansal rol DEGIL', () => {
    assert.equal(canViewFinancialFields('office'), false);
    assert.equal(FINANCIAL_ROLES.includes('office' as never), false);
  });

  it('admin, boss ve accounting gorur', () => {
    for (const role of FINANCIAL_ROLES) {
      assert.equal(canViewFinancialFields(role), true, `beklenmedik rol: ${role}`);
    }
  });

  it('fatura kesme yetkisi office"i ICERIR ama finansal gorunurluk vermez', () => {
    // Faz 15'te kurulan ayrim: office fatura keser, bordro/abonelik gormez.
    assert.equal(INVOICING_ROLES.includes('office'), true);
    assert.equal(FINANCIAL_ROLES.includes('office' as never), false);
  });
});

describe('office maskelemesi — Faz 18B alanlari', () => {
  /** Faz 18B'de dogan her yeni parasal alan burada. */
  const payload = {
    summary: {
      totalCost: { current: '410.00' },
      fineCost: { current: '60.00' },
      estimatedRevenue: { current: '500.00' },
      actualRevenue: { current: '300.00' },
      margin: { current: '200.00' },
      pendingServiceCost: '900.00',
      disputedFineCost: '320.00',
      // Sinif ve adet SAYI/ETIKET: tutar degil, maskelenmiyor.
      pendingServiceCount: 1,
      disputedFineCount: 1,
    },
    composition: { fuel: '100.00' },
    excludedFromTotals: { pendingService: '900.00' },
    unconvertedByCurrency: [{ currency: 'TRY', amount: '5000.00', entryCount: 1 }],
    vehicles: [
      {
        plate_number: 'DU-AB 123',
        estimated_revenue: 500,
        actual_revenue: 300,
        total_cost: 410,
        fine_cost: 60,
        pending_service_cost: 900,
        disputed_fine_cost: 320,
      },
    ],
    revenueAnalytics: { todayActualRevenue: 300 },
    chartAnalytics: { dailyActualRevenue: [] },
  };

  it('office icin butun parasal alanlar null', () => {
    const masked = maskFinancialFields(payload, 'office') as typeof payload;

    assert.equal(masked.summary.estimatedRevenue, null);
    assert.equal(masked.summary.actualRevenue, null);
    assert.equal(masked.summary.margin, null);
    assert.equal(masked.summary.totalCost, null);
    assert.equal(masked.summary.fineCost, null);
    assert.equal(masked.summary.pendingServiceCost, null);
    assert.equal(masked.summary.disputedFineCost, null);
    assert.equal(masked.composition, null);
    assert.equal(masked.excludedFromTotals, null);
    assert.equal(masked.unconvertedByCurrency, null);
    assert.equal(masked.revenueAnalytics, null);
    assert.equal(masked.chartAnalytics, null);

    const vehicle = masked.vehicles[0]!;
    assert.equal(vehicle.estimated_revenue, null);
    assert.equal(vehicle.actual_revenue, null);
    assert.equal(vehicle.total_cost, null);
    assert.equal(vehicle.fine_cost, null);
    assert.equal(vehicle.pending_service_cost, null);
    assert.equal(vehicle.disputed_fine_cost, null);
    // Parasal OLMAYAN alan korunuyor: maskeleme kor degil.
    assert.equal(vehicle.plate_number, 'DU-AB 123');
  });

  it('adetler maskelenMIYOR: "kac kayit bekliyor" parasal bir bilgi degil', () => {
    const masked = maskFinancialFields(payload, 'office') as typeof payload;
    assert.equal(masked.summary.pendingServiceCount, 1);
    assert.equal(masked.summary.disputedFineCount, 1);
  });

  it('accounting AYNI veriyi degistirilmeden alir', () => {
    const masked = maskFinancialFields(payload, 'accounting');
    assert.deepEqual(masked, payload);
  });
});

describe('office maskelemesi — uc seviyesinde kapi', () => {
  it('vehicle-costs ve cost-dashboard uclari office"e KAPALI', () => {
    for (const name of ['getVehicleCosts', 'getCostDashboard'] as const) {
      const handler = Reflect.get(DashboardController.prototype as object, name) as object;
      const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
      assert.equal(roles.includes('office'), false, `${name} office'e acik`);
      assert.deepEqual([...roles].sort(), [...FINANCIAL_ROLES].sort());
    }
  });

  it('gelir uclari da office"e KAPALI', () => {
    for (const name of ['getRevenueAnalytics', 'getRevenueByCompany'] as const) {
      const handler = Reflect.get(DashboardController.prototype as object, name) as object;
      const roles = Reflect.getMetadata(ROLES_KEY, handler) as string[];
      assert.equal(roles.includes('office'), false, `${name} office'e acik`);
    }
  });

  it('genel dashboard ucu GET dashboard olarak duruyor', () => {
    const handler = Reflect.get(DashboardController.prototype as object, 'getDashboard') as object;
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), '/');
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), RequestMethod.GET);
  });
});
