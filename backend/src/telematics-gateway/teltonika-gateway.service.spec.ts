import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TeltonikaGatewayService } from './teltonika-gateway.service';

describe('TeltonikaGatewayService ACK policy', () => {
  it('withholds ACK when queue enqueue fails', async () => {
    const prisma = {
      unscoped: {
        device: {
          findFirst: async () => ({
            tenantId: 'default-tenant',
            vehicleId: 'veh-1',
            model: 'FMC130',
          }),
        },
      },
    };
    const telemetryQueue = {
      enqueueIngest: async () => {
        throw new Error('redis unavailable');
      },
      enqueueQuarantine: async () => {},
    };
    const metrics = {
      telematicsFramesTotal: { inc() {} },
      telematicsParseErrorsTotal: { inc() {} },
      telematicsQuarantinedTotal: { inc() {} },
      telematicsAckLatencyMs: { observe() {} },
    };

    const gateway = new TeltonikaGatewayService(
      prisma as never,
      telemetryQueue as never,
      metrics as never,
      15027,
    );

    const writes: Buffer[] = [];
    const socket = {
      write(chunk: Buffer) {
        writes.push(chunk);
      },
    };

    const accepted = await (
      gateway as unknown as {
        enqueuePacket: (
          state: { imei?: string; device?: { tenantId: string; vehicleId: string } },
          records: unknown[],
        ) => Promise<number>;
      }
    ).enqueuePacket(
      { imei: '359339080000101', device: { tenantId: 'default-tenant', vehicleId: 'veh-1' } },
      [
        {
          timestampMs: Date.now(),
          priority: 1,
          latitude: 52.5,
          longitude: 13.4,
          speedKph: 40,
          angleDeg: 90,
          io: { eventId: 0, totalCount: 4, values: new Map() },
        },
      ],
    );

    assert.equal(accepted, null);
    assert.equal(writes.length, 0);
  });
});
