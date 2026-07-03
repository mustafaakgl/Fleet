import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TELEMATICS_THRESHOLDS } from './telematics-thresholds';

describe('telematics-thresholds', () => {
  it('exposes alarm suppression window and idle fuel constants', () => {
    assert.ok(TELEMATICS_THRESHOLDS.alarmSuppressionMs >= 60 * 60 * 1000);
    assert.equal(TELEMATICS_THRESHOLDS.idleSpeedKph, 2);
    assert.equal(TELEMATICS_THRESHOLDS.idleWatchMinutes, 10);
    assert.equal(TELEMATICS_THRESHOLDS.idleFuelLitersPerHourTruck, 3.0);
    assert.equal(TELEMATICS_THRESHOLDS.defaultFuelEurPerLiter, 1.75);
  });
});
