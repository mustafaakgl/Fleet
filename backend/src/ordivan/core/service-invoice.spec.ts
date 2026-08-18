import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeChecks } from './automation-check.contract';
import {
  buildServiceInvoiceChecks,
  costOptions,
  matchVehicle,
  normalizeIdentifier,
  type ServiceInvoiceDraft,
  type VehicleCandidate,
} from './service-invoice';

const FLEET: VehicleCandidate[] = [
  { id: 'veh-1', plateNumber: 'DU-AB 123', vin: 'WDB9634031L123456' },
  { id: 'veh-2', plateNumber: 'DU-CD 456', vin: 'WMA06XZZ8CM543210' },
  { id: 'veh-3', plateNumber: 'DU-EF 789', vin: null },
];

function draft(overrides: Partial<ServiceInvoiceDraft> = {}): ServiceInvoiceDraft {
  return {
    vendorName: 'Werkstatt Nord',
    serviceDate: '2026-08-10',
    plateNumber: 'DU-AB 123',
    vin: 'WDB9634031L123456',
    mileageKm: 412_000,
    currency: 'EUR',
    netAmount: 1000,
    taxAmount: 190,
    grossAmount: 1190,
    ...overrides,
  };
}

describe('service-invoice — arac eslestirme', () => {
  it('tanimlayicilar bosluk/tire farkindan bagimsiz normalize edilir', () => {
    assert.equal(normalizeIdentifier(' du-ab 123 '), 'DUAB123');
    assert.equal(normalizeIdentifier(null), '');
  });

  it('tam VIN eslesmesi kazanir', () => {
    const match = matchVehicle(FLEET, { vin: 'wdb 9634031l123456', plateNumber: null });
    assert.equal(match.status, 'verified');
    assert.equal(match.vehicleId, 'veh-1');
    assert.equal(match.matchedBy, 'vin');
  });

  it('VIN yoksa tam plaka eslesmesi kullanilir', () => {
    const match = matchVehicle(FLEET, { plateNumber: 'DU-EF789' });
    assert.equal(match.status, 'verified');
    assert.equal(match.vehicleId, 'veh-3');
    assert.equal(match.matchedBy, 'plate');
  });

  it('VIN ve plaka FARKLI araci gosteriyorsa `failed` — bu bir "bilmiyorum" degil', () => {
    const match = matchVehicle(FLEET, {
      vin: 'WDB9634031L123456',
      plateNumber: 'DU-CD 456',
    });
    assert.equal(match.status, 'failed');
    assert.equal(match.vehicleId, null);
    assert.equal(match.reason, 'vin_and_plate_disagree');
    assert.deepEqual(match.candidateIds.sort(), ['veh-1', 'veh-2']);
  });

  it('birden fazla aday varsa karar INSANIN', () => {
    const twins: VehicleCandidate[] = [
      { id: 'a', plateNumber: 'DU-XX 1', vin: null },
      { id: 'b', plateNumber: 'DU-XX 1', vin: null },
    ];
    const match = matchVehicle(twins, { plateNumber: 'DU-XX1' });
    assert.equal(match.status, 'unknown');
    assert.equal(match.reason, 'multiple_plate_matches');
    assert.deepEqual(match.candidateIds, ['a', 'b']);
  });

  it('hicbir sey eslesmezse unknown; arac SECILMEZ', () => {
    const match = matchVehicle(FLEET, { plateNumber: 'B-ZZ 9999' });
    assert.equal(match.status, 'unknown');
    assert.equal(match.vehicleId, null);
    assert.equal(match.reason, 'no_matching_vehicle');
  });

  it('kismi/benzer plaka ESLESMEZ', () => {
    const match = matchVehicle(FLEET, { plateNumber: 'DU-AB 1234' });
    assert.equal(match.status, 'unknown');
  });

  it('tanimlayici hic yoksa ayri bir gerekce doner', () => {
    const match = matchVehicle(FLEET, {});
    assert.equal(match.reason, 'no_vehicle_identifier');
  });
});

describe('service-invoice — kontroller', () => {
  const verifiedMatch = matchVehicle(FLEET, { vin: 'WDB9634031L123456' });

  it('tam ve tutarli fatura butun kontrolleri gecer', () => {
    const checks = buildServiceInvoiceChecks({ draft: draft(), vehicleMatch: verifiedMatch });
    const summary = summarizeChecks(checks);

    assert.equal(summary.allVerified, true);
    assert.equal(summary.hasUnknown, false);
  });

  it('net + vergi brute uymuyorsa `failed`', () => {
    const checks = buildServiceInvoiceChecks({
      draft: draft({ grossAmount: 1500 }),
      vehicleMatch: verifiedMatch,
    });
    const amount = checks.find((check) => check.code === 'amount_consistency')!;

    assert.equal(amount.status, 'failed');
    assert.equal(amount.evidence?.difference, 310);
  });

  it('tutarlardan biri eksikse `unknown` — "sorun yok" DEGIL', () => {
    const checks = buildServiceInvoiceChecks({
      draft: draft({ taxAmount: null }),
      vehicleMatch: verifiedMatch,
    });
    const amount = checks.find((check) => check.code === 'amount_consistency')!;

    assert.equal(amount.status, 'unknown');
    assert.equal(amount.unknownReason, 'amounts_incomplete');
    assert.equal(summarizeChecks(checks).allVerified, false);
  });

  it('para birimi eksikse EUR VARSAYILMAZ, unknown doner', () => {
    const checks = buildServiceInvoiceChecks({
      draft: draft({ currency: null }),
      vehicleMatch: verifiedMatch,
    });
    const currency = checks.find((check) => check.code === 'currency_present')!;

    assert.equal(currency.status, 'unknown');
    assert.equal(currency.unknownReason, 'currency_missing');
    assert.equal(currency.evidence?.currency, null);
  });

  it('servis tarihi okunamazsa unknown ve gerekcesi ayrilir', () => {
    const missing = buildServiceInvoiceChecks({
      draft: draft({ serviceDate: null }),
      vehicleMatch: verifiedMatch,
    }).find((check) => check.code === 'service_date_present')!;
    assert.equal(missing.unknownReason, 'service_date_missing');

    const broken = buildServiceInvoiceChecks({
      draft: draft({ serviceDate: '10.08.2026' }),
      vehicleMatch: verifiedMatch,
    }).find((check) => check.code === 'service_date_present')!;
    assert.equal(broken.unknownReason, 'service_date_unparsable');
  });

  it('arac celiskisi kontrol listesine `failed` olarak duser', () => {
    const conflict = matchVehicle(FLEET, {
      vin: 'WDB9634031L123456',
      plateNumber: 'DU-CD 456',
    });
    const checks = buildServiceInvoiceChecks({ draft: draft(), vehicleMatch: conflict });
    const vehicle = checks.find((check) => check.code === 'vehicle_match')!;

    assert.equal(vehicle.status, 'failed');
    assert.equal(summarizeChecks(checks).allVerified, false);
  });
});

describe('service-invoice — kaydedilecek tutar', () => {
  it('net ve brut ikisi de secenek olarak sunulur', () => {
    assert.deepEqual(costOptions(draft()), [
      { basis: 'net', amount: 1000 },
      { basis: 'gross', amount: 1190 },
    ]);
  });

  it('yalnizca biri varsa yalnizca o sunulur — digeri UYDURULMAZ', () => {
    assert.deepEqual(costOptions(draft({ netAmount: null })), [{ basis: 'gross', amount: 1190 }]);
    assert.deepEqual(costOptions({ }), []);
  });
});
