import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { AutomationJobService } from './automation-job.service';
import type { AuthenticatedConnector } from './ordivan-connector.service';

type Row = Record<string, unknown>;

/**
 * Is ve kiralama protokolu (Faz 12).
 *
 * Prisma MOCK ama kosullu `updateMany`yi GERCEKTEN uyguluyor — eszamanlilik,
 * bayat deneme ve idempotency testleri ancak boyle anlamli.
 */
function build(options: { jobs?: Row[] } = {}) {
  const jobs: Row[] = (options.jobs ?? []).map((row) => ({ ...row }));
  const runs: Row[] = [];
  const proposals: Row[] = [];
  const approvalTasks: Row[] = [];
  const audits: Row[] = [];
  let seq = 0;

  const matchValue = (actual: unknown, expected: unknown): boolean => {
    if (expected === null) return actual === null || actual === undefined;
    if (expected instanceof Date) {
      return actual instanceof Date && actual.getTime() === expected.getTime();
    }
    if (expected !== null && typeof expected === 'object') {
      const spec = expected as { in?: unknown[]; lt?: Date; not?: unknown; gt?: number };
      if (spec.in) return spec.in.includes(actual);
      if (spec.lt instanceof Date) return actual instanceof Date && actual < spec.lt;
      if ('not' in spec) return actual !== spec.not;
      if (typeof spec.gt === 'number') return typeof actual === 'number' && actual > spec.gt;
      return false;
    }
    return actual === expected;
  };

  const matches = (row: Row, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true;
    for (const [key, expected] of Object.entries(where)) {
      if (key === 'tenantId') continue;
      if (key === 'OR') {
        const branches = expected as Array<Record<string, unknown>>;
        if (!branches.some((branch) => matches(row, branch))) return false;
        continue;
      }
      if (!matchValue(row[key], expected)) return false;
    }
    return true;
  };

  const table = (store: Row[], prefix: string, defaults: Row = {}) => ({
    create: async (args: { data: Row }) => {
      seq += 1;
      const row: Row = {
        id: `${prefix}-${seq}`,
        tenantId: 'tenant-a',
        createdAt: new Date(),
        ...defaults,
        ...args.data,
      };
      store.push(row);
      return { ...row };
    },
    createMany: async (args: { data: Row[] }) => {
      for (const item of args.data) {
        seq += 1;
        store.push({ id: `${prefix}-${seq}`, tenantId: 'tenant-a', ...defaults, ...item });
      }
      return { count: args.data.length };
    },
    findFirst: async (args: { where?: Record<string, unknown> }) => {
      const found = store.find((row) => matches(row, args.where));
      return found ? { ...found } : null;
    },
    findMany: async (args: { where?: Record<string, unknown>; take?: number } = {}) => {
      const found = store.filter((row) => matches(row, args.where));
      return (args.take ? found.slice(0, args.take) : found).map((row) => ({ ...row }));
    },
    count: async (args: { where?: Record<string, unknown> } = {}) =>
      store.filter((row) => matches(row, args.where)).length,
    updateMany: async (args: { where?: Record<string, unknown>; data: Row }) => {
      let count = 0;
      for (const row of store) {
        if (matches(row, args.where)) {
          Object.assign(row, args.data);
          count += 1;
        }
      }
      return { count };
    },
  });

  const client = {
    // Gercek semadaki `@default` degerleri: bunlar olmadan `attempt`
    // undefined kalir ve `attempt + 1` NaN uretir — sahte veritabani
    // gercegini taklit etmedigi icin test yanlis yerde duserdi.
    automationJob: table(jobs, 'job', {
      attempt: 0,
      maxAttempts: 3,
      status: 'queued',
      leaseToken: null,
      leasedByConnectorId: null,
      leasedAt: null,
      leaseExpiresAt: null,
      completedAt: null,
      failedAt: null,
      deadLetteredAt: null,
      failureClass: null,
    }),
    agentRun: table(runs, 'run'),
    automationProposal: table(proposals, 'proposal'),
    approvalTask: table(approvalTasks, 'task'),
  };
  const prisma = { ...client, unscoped: client };
  const audit = { logAction: async (entry: Row) => { audits.push(entry); return {}; } };

  const service = new AutomationJobService(prisma as never, audit as never);
  return { service, jobs, runs, proposals, approvalTasks, audits };
}

function connector(overrides: Partial<AuthenticatedConnector> = {}): AuthenticatedConnector {
  return {
    connectorId: 'conn-1',
    tenantId: 'tenant-a',
    capabilities: ['system.echo'],
    displayName: 'Buro-PC',
    ...overrides,
  };
}

async function queuedEchoJob(ctx: ReturnType<typeof build>) {
  return ctx.service.createJob('user-admin', {
    jobType: 'system.echo',
    schemaVersion: 1,
    payload: { message: 'hallo' },
  });
}

describe('AutomationJobService — is olusturma', () => {
  it('registry disi is turu kuyruga HIC girmez', async () => {
    const { service, jobs } = build();
    await assert.rejects(
      service.createJob('user-admin', { jobType: 'domain.create_invoice', payload: {} }),
      BadRequestException,
    );
    assert.equal(jobs.length, 0);
  });

  it('desteklenmeyen sema surumu reddedilir', async () => {
    const { service } = build();
    await assert.rejects(
      service.createJob('user-admin', {
        jobType: 'system.echo',
        schemaVersion: 99,
        payload: { message: 'x' },
      }),
      BadRequestException,
    );
  });

  it('beklenmeyen alan reddedilir — yok sayilmaz', async () => {
    const { service } = build();
    await assert.rejects(
      service.createJob('user-admin', {
        jobType: 'system.echo',
        payload: { message: 'x', autoApprove: true },
      }),
      BadRequestException,
    );
  });

  it('payload DENETIME girmez', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);
    const logged = JSON.stringify(ctx.audits);
    assert.ok(!logged.includes('hallo'), 'payload denetime sizdi');
  });
});

describe('AutomationJobService — kiralama', () => {
  it('yetenegi olmayan connector is ALAMAZ', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);

    const leased = await ctx.service.leaseJob(
      connector({ capabilities: ['document.classification'] }),
    );
    assert.equal(leased, null);
  });

  it('yeteneksiz connector hic sorgu yapmadan bos doner', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);
    assert.equal(await ctx.service.leaseJob(connector({ capabilities: [] })), null);
  });

  it('AYNI ISI iki connector ayni anda ALAMAZ', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);

    const [first, second] = await Promise.all([
      ctx.service.leaseJob(connector({ connectorId: 'conn-1' })),
      ctx.service.leaseJob(connector({ connectorId: 'conn-2' })),
    ]);

    const winners = [first, second].filter(Boolean);
    assert.equal(winners.length, 1, 'is iki kez kiralandi');
  });

  it('kiralama arac setini SUNUCUDAN verir', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);
    const leased = await ctx.service.leaseJob(connector());

    assert.deepEqual(leased!.toolset, []);
    assert.deepEqual(leased!.allowedProposalTypes, ['system.echo_result']);
    // Kosu kaydi hangi yetkiyle calisildigini tasiyor.
    assert.deepEqual(ctx.runs[0]!.toolset, []);
    assert.deepEqual(ctx.runs[0]!.capabilities, ['system.echo']);
  });

  it('deneme siniri dolmus is kiralanmaz', async () => {
    const ctx = build();
    const job = await queuedEchoJob(ctx);
    Object.assign(ctx.jobs.find((row) => row.id === job.id)!, { attempt: 3, maxAttempts: 3 });

    assert.equal(await ctx.service.leaseJob(connector()), null);
  });
});

describe('AutomationJobService — tamamlama', () => {
  async function leased() {
    const ctx = build();
    await queuedEchoJob(ctx);
    const job = await ctx.service.leaseJob(connector());
    return { ctx, job: job! };
  }

  it('gecerli sonuc oneri ve inceleme gorevi uretir', async () => {
    const { ctx, job } = await leased();

    const result = await ctx.service.completeJob(connector(), job.jobId, {
      leaseToken: job.leaseToken,
      proposalType: 'system.echo_result',
      payload: { echoed: 'hallo' },
      checks: [{ code: 'echo_roundtrip', status: 'verified', messageKey: 'k' }],
    });

    assert.equal(result.repeated, false);
    assert.equal(ctx.proposals.length, 1);
    assert.equal(ctx.approvalTasks.length, 1);
    assert.equal(ctx.jobs[0]!.status, 'completed');
  });

  it('IDEMPOTENT: ayni token ile tekrar ikinci oneri URETMEZ', async () => {
    const { ctx, job } = await leased();
    const payload = {
      leaseToken: job.leaseToken,
      proposalType: 'system.echo_result',
      payload: { echoed: 'hallo' },
    };

    const first = await ctx.service.completeJob(connector(), job.jobId, payload);
    const second = await ctx.service.completeJob(connector(), job.jobId, payload);

    assert.equal(second.repeated, true);
    assert.equal(second.proposalId, first.proposalId);
    assert.equal(ctx.proposals.length, 1);
  });

  it('BAYAT deneme yeni sonucu EZEMEZ', async () => {
    const { ctx, job } = await leased();

    // Kiralama suresi doldu, is yeniden kiralandi: token degisti.
    Object.assign(ctx.jobs[0]!, { leaseExpiresAt: new Date(Date.now() - 1000) });
    const second = await ctx.service.leaseJob(connector({ connectorId: 'conn-2' }));
    assert.ok(second);

    // Eski deneme simdi geliyor.
    await assert.rejects(
      ctx.service.completeJob(connector(), job.jobId, {
        leaseToken: job.leaseToken,
        proposalType: 'system.echo_result',
        payload: { echoed: 'eski sonuc' },
      }),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(
          (error.getResponse() as { code?: string }).code,
          'ordivan_lease_not_current',
        );
        return true;
      },
    );
    assert.equal(ctx.proposals.length, 0, 'bayat deneme oneri yazdi');
  });

  it('whitelist disi oneri turu REDDEDILIR', async () => {
    const { ctx, job } = await leased();
    await assert.rejects(
      ctx.service.completeJob(connector(), job.jobId, {
        leaseToken: job.leaseToken,
        proposalType: 'domain.create_assignment',
        payload: { anything: true },
      }),
      BadRequestException,
    );
    assert.equal(ctx.proposals.length, 0);
  });

  it('is turunun uretemeyecegi oneri turu REDDEDILIR', async () => {
    const { ctx, job } = await leased();
    await assert.rejects(
      ctx.service.completeJob(connector(), job.jobId, {
        leaseToken: job.leaseToken,
        proposalType: 'document.classification',
        payload: { documentKind: 'invoice', confidence: 0.9 },
      }),
      BadRequestException,
    );
  });

  it('gerekcesiz unknown kontrolu kabul EDILMEZ', async () => {
    const { ctx, job } = await leased();
    await assert.rejects(
      ctx.service.completeJob(connector(), job.jobId, {
        leaseToken: job.leaseToken,
        proposalType: 'system.echo_result',
        payload: { echoed: 'ok' },
        checks: [{ code: 'x', status: 'unknown', messageKey: 'k' }],
      }),
      BadRequestException,
    );
  });

  it('oneri govdesi DENETIME girmez', async () => {
    const { ctx, job } = await leased();
    await ctx.service.completeJob(connector(), job.jobId, {
      leaseToken: job.leaseToken,
      proposalType: 'system.echo_result',
      payload: { echoed: 'gizli-deger-42' },
    });

    const logged = JSON.stringify(ctx.audits);
    assert.ok(!logged.includes('gizli-deger-42'), 'oneri govdesi denetime sizdi');
  });
});

describe('AutomationJobService — hata ve dead-letter', () => {
  it('sinir altinda hata isi KUYRUGA geri koyar', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);
    const job = await ctx.service.leaseJob(connector());

    const result = await ctx.service.failJob(connector(), job!.jobId, {
      leaseToken: job!.leaseToken,
      failureClass: 'connector_timeout',
    });

    assert.equal(result.status, 'queued');
    assert.equal(ctx.jobs[0]!.leaseToken, null);
  });

  it('deneme siniri dolunca DEAD-LETTER — sonsuz tekrar yok', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);

    let last: { status: string } | null = null;
    for (let index = 0; index < 3; index += 1) {
      const job = await ctx.service.leaseJob(connector());
      assert.ok(job, `deneme ${index + 1} kiralanamadi`);
      last = await ctx.service.failJob(connector(), job!.jobId, {
        leaseToken: job!.leaseToken,
        failureClass: 'connector_timeout',
      });
    }

    assert.equal(last!.status, 'dead_letter');
    assert.equal(ctx.jobs[0]!.status, 'dead_letter');
    // Dead-letter olan is bir daha kiralanmaz.
    assert.equal(await ctx.service.leaseJob(connector()), null);
  });

  it('suresi dolmus kiralama toparlanir', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);
    const job = await ctx.service.leaseJob(connector());
    Object.assign(ctx.jobs[0]!, { leaseExpiresAt: new Date(Date.now() - 1000) });

    const result = await ctx.service.reclaimExpiredLeases();
    assert.equal(result.requeued, 1);
    assert.equal(ctx.jobs[0]!.status, 'queued');
    void job;
  });

  it('toparlama, connector arada tamamladiysa UYGULANMAZ', async () => {
    const ctx = build();
    await queuedEchoJob(ctx);
    const job = await ctx.service.leaseJob(connector());
    Object.assign(ctx.jobs[0]!, { leaseExpiresAt: new Date(Date.now() - 1000) });

    await ctx.service.completeJob(connector(), job!.jobId, {
      leaseToken: job!.leaseToken,
      proposalType: 'system.echo_result',
      payload: { echoed: 'ok' },
    });

    const result = await ctx.service.reclaimExpiredLeases();
    assert.equal(result.requeued, 0);
    assert.equal(ctx.jobs[0]!.status, 'completed');
  });
});
