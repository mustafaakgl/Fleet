import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TachographQueueService } from './tachograph-queue.service';

class StubMetrics {
  tachographAckLatencyMs = { observe() {} };
  tachographQueueDepth = { set() {} };
}

describe('TachographQueueService inline mode', () => {
  it('processes successful jobs in inline fallback mode when REDIS_URL is unset', async () => {
    const previous = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    const service = new TachographQueueService(new StubMetrics() as never);
    let handled = 0;

    service.registerHandler('tachograph.ddd.process', async () => {
      handled += 1;
    });
    service.onModuleInit();

    await service.enqueueDddProcess({
      tenantId: 'default-tenant',
      dddFileId: 'ddd-1',
    });

    assert.equal(service.mode, 'inline');
    assert.equal(handled, 1);

    if (previous) {
      process.env.REDIS_URL = previous;
    }
  });

  it('retries with exponential backoff and succeeds before max attempts', async () => {
    const previous = process.env.REDIS_URL;
    const originalSetTimeout = global.setTimeout;
    delete process.env.REDIS_URL;

    (global as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((
      callback: (...args: unknown[]) => void,
    ) => {
      callback();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout;

    const service = new TachographQueueService(new StubMetrics() as never);
    let attempts = 0;

    service.registerHandler('tachograph.ddd.process', async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('temporary parse failure');
      }
    });
    service.onModuleInit();

    await service.enqueueDddProcess({
      tenantId: 'default-tenant',
      dddFileId: 'ddd-retry-success',
    });

    assert.equal(attempts, 3);

    (global as unknown as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout;
    if (previous) {
      process.env.REDIS_URL = previous;
    }
  });

  it('invokes permanent failure handler on persistent failure', async () => {
    const previous = process.env.REDIS_URL;
    const originalSetTimeout = global.setTimeout;
    delete process.env.REDIS_URL;

    (global as unknown as { setTimeout: typeof setTimeout }).setTimeout = ((
      callback: (...args: unknown[]) => void,
    ) => {
      callback();
      return 0 as unknown as NodeJS.Timeout;
    }) as typeof setTimeout;

    const service = new TachographQueueService(new StubMetrics() as never);
    let permanentFailureCalls = 0;

    service.registerHandler('tachograph.ddd.process', async () => {
      throw new Error('invalid DDD payload');
    });

    service.registerPermanentFailureHandler('tachograph.ddd.process', async (payload, error) => {
      permanentFailureCalls += 1;
      assert.deepEqual(payload, {
        tenantId: 'default-tenant',
        dddFileId: 'ddd-hard-fail',
      });
      assert.equal((error as Error).message, 'invalid DDD payload');
    });

    service.onModuleInit();

    await assert.rejects(
      service.enqueueDddProcess({ tenantId: 'default-tenant', dddFileId: 'ddd-hard-fail' }),
      /invalid DDD payload/,
    );
    assert.equal(permanentFailureCalls, 1);

    (global as unknown as { setTimeout: typeof setTimeout }).setTimeout = originalSetTimeout;
    if (previous) {
      process.env.REDIS_URL = previous;
    }
  });

  it('treats duplicated enqueue payload as idempotent no-op in consumer logic', async () => {
    const previous = process.env.REDIS_URL;
    delete process.env.REDIS_URL;

    const service = new TachographQueueService(new StubMetrics() as never);
    const processed = new Set<string>();
    let processedCount = 0;

    service.registerHandler('tachograph.ddd.process', async (payload) => {
      const job = payload as { tenantId: string; dddFileId: string };
      const key = `${job.tenantId}:${job.dddFileId}`;
      if (processed.has(key)) {
        return;
      }
      processed.add(key);
      processedCount += 1;
    });

    service.onModuleInit();

    const payload = { tenantId: 'default-tenant', dddFileId: 'ddd-duplicate' };
    await service.enqueueDddProcess(payload);
    await service.enqueueDddProcess(payload);

    assert.equal(processedCount, 1);

    if (previous) {
      process.env.REDIS_URL = previous;
    }
  });
});
