import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  FMC003_IO_MAP,
  TELEMATICS_IO_MAP,
  collectUnmappedIoIds,
  normalizeIoToTelemetry,
  resolveIoMap,
  type ParsedAvlIo,
} from './avl-io-map';

function io(values: Record<number, number | bigint>, rawValues?: Record<number, string>): ParsedAvlIo {
  return {
    eventId: 0,
    totalCount: Object.keys(values).length,
    values: new Map(Object.entries(values).map(([id, value]) => [Number(id), value])),
    rawValues: rawValues
      ? new Map(Object.entries(rawValues).map(([id, text]) => [Number(id), Buffer.from(text, 'ascii')]))
      : undefined,
  };
}

describe('resolveIoMap', () => {
  it('gives the OBD dongle its own map', () => {
    assert.equal(resolveIoMap('FMC003'), FMC003_IO_MAP);
  });

  it('keeps the main units on the shared map', () => {
    assert.equal(resolveIoMap('FMC130'), TELEMATICS_IO_MAP);
    assert.equal(resolveIoMap('FMC650'), TELEMATICS_IO_MAP);
  });

  it('falls back to the shared map for an unknown or missing model', () => {
    assert.equal(resolveIoMap('FMC920'), TELEMATICS_IO_MAP);
    assert.equal(resolveIoMap(undefined), TELEMATICS_IO_MAP);
  });
});

describe('AVL 32 means different things per model', () => {
  // Bu testin tek isi: FMC003 takildiginda motor sicakliginin devir sutununa
  // yazilmasini engellemek. Ortak harita kullanilsaydi tam olarak bu olurdu.
  it('reads 32 as coolant temperature on the OBD dongle', () => {
    const result = normalizeIoToTelemetry(io({ 32: 89 }), 0, FMC003_IO_MAP);

    assert.equal(result.coolantTemp, 89);
    assert.equal(result.rpm, undefined);
  });

  it('still reads 32 as rpm on the main units', () => {
    const result = normalizeIoToTelemetry(io({ 32: 1500 }), 0, TELEMATICS_IO_MAP);

    assert.equal(result.rpm, 1500);
    assert.equal(result.coolantTemp, undefined);
  });
});

describe('FMC003 OEM fields', () => {
  it('reads fuel level and odometer from the OEM elements', () => {
    const result = normalizeIoToTelemetry(io({ 390: 62, 389: 154_000 }), 0, FMC003_IO_MAP);

    assert.equal(result.fuelLevelPct, 62);
    assert.equal(result.odometerKm, 154);
  });

  it('ignores the element ids the main units use', () => {
    const result = normalizeIoToTelemetry(io({ 86: 40, 16: 999_000 }), 0, FMC003_IO_MAP);

    assert.equal(result.fuelLevelPct, undefined);
    assert.equal(result.odometerKm, undefined);
  });
});

describe('FMC003 fault codes', () => {
  it('decodes the codes from the text element', () => {
    const result = normalizeIoToTelemetry(io({ 30: 2 }, { 281: 'P0100,P0234' }), 0, FMC003_IO_MAP);

    assert.equal(result.dtcPresent, true);
    assert.deepEqual(
      result.dtc.map((entry) => entry.code),
      ['P0100', 'P0234'],
    );
  });

  it('treats a zero count as "no faults" so existing records get cleared', () => {
    const result = normalizeIoToTelemetry(io({ 30: 0 }), 0, FMC003_IO_MAP);

    assert.equal(result.dtcPresent, true);
    assert.deepEqual(result.dtc, []);
  });

  it('withholds the update when codes are announced but unreadable', () => {
    // Bos liste gonderilseydi acik ariza kayitlari kapatilmis sayilirdi.
    const result = normalizeIoToTelemetry(io({ 30: 3 }, { 281: '???' }), 0, FMC003_IO_MAP);

    assert.equal(result.dtcUnreadable, true);
    assert.equal(result.dtcPresent, false);
    assert.deepEqual(result.dtc, []);
  });

  it('never invents a code from an unexpected format', () => {
    const result = normalizeIoToTelemetry(io({ 30: 1 }, { 281: 'ERROR 17' }), 0, FMC003_IO_MAP);

    assert.deepEqual(result.dtc, []);
  });

  it('says nothing when the device did not report the counter at all', () => {
    const result = normalizeIoToTelemetry(io({ 239: 1 }), 0, FMC003_IO_MAP);

    assert.equal(result.dtcPresent, false);
    assert.equal(result.dtcUnreadable, false);
  });
});

describe('main-unit behaviour is unchanged', () => {
  it('still decodes the bitmask element', () => {
    const result = normalizeIoToTelemetry(io({ 272: 0x8001 }), 0, TELEMATICS_IO_MAP);

    assert.equal(result.dtcPresent, true);
    assert.deepEqual(
      result.dtc.map((entry) => entry.severity),
      ['medium', 'critical'],
    );
  });

  it('reports presence even when the bitmask is zero, so faults can clear', () => {
    const result = normalizeIoToTelemetry(io({ 272: 0 }), 0, TELEMATICS_IO_MAP);

    assert.equal(result.dtcPresent, true);
    assert.deepEqual(result.dtc, []);
  });
});

describe('collectUnmappedIoIds', () => {
  it('lists exactly the elements the map does not consume', () => {
    const unmapped = collectUnmappedIoIds(io({ 239: 1, 32: 90, 999: 5, 12: 7 }), FMC003_IO_MAP);

    assert.deepEqual(unmapped, [12, 999]);
  });
});
