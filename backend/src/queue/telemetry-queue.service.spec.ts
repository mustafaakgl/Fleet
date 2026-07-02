import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TelemetryQueueService } from './telemetry-queue.service';

class StubMetrics {
  telematicsQuarantinedTotal = { inc() {} };
  telematicsAckLatencyMs = { observe() {} };
  telematicsQueueDepth = { set() {} };
}

describe('TelemetryQueueService inline mode', () => {
  it('runs ingest handler inline when REDIS_URL is unset', async () => {
    const previous = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    const service = new TelemetryQueueService(new StubMetrics() as never);
    let handled = 0;
    service.registerHandler('telemetry.ingest', async () => {
      handled += 1;
    });
    service.onModuleInit();

    await service.enqueueIngest({
      tenantId: 'default-tenant',
      vehicleId: 'veh-1',
      imei: '359339080000101',
      records: [],
    });

    assert.equal(handled, 1);
    assert.equal(service.mode, 'inline');

    if (previous) {
      process.env.REDIS_URL = previous;
    }
  });
});
