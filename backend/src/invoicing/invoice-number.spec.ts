import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateInvoiceNumber, formatInvoiceNumber } from './invoice-number';

describe('invoice number allocation', () => {
  it('formats the default German invoice number', () => {
    assert.equal(formatInvoiceNumber('RE-{YYYY}-{00001}', 2026, 42), 'RE-2026-00042');
  });

  it('rejects formats that cannot produce an unambiguous number', () => {
    assert.throws(() => formatInvoiceNumber('RE-{00001}', 2026, 1), /YYYY/);
    assert.throws(() => formatInvoiceNumber('RE-{YYYY}', 2026, 1), /exactly one/);
    assert.throws(
      () => formatInvoiceNumber('RE-{YYYY}-{001}-{001}', 2026, 1),
      /exactly one/,
    );
    assert.throws(() => formatInvoiceNumber('RE-{YYYY}-{01}', 2026, 100), /exceeds/);
  });

  it('uses the value returned by the atomic database upsert', async () => {
    let calls = 0;
    const tx = {
      $queryRaw: async () => {
        calls += 1;
        return [{ lastValue: 7 }];
      },
    };

    const allocated = await allocateInvoiceNumber(
      tx,
      'tenant-a',
      new Date('2026-07-27T12:00:00.000Z'),
      'RE-{YYYY}-{00001}',
    );

    assert.equal(calls, 1);
    assert.deepEqual(allocated, {
      number: 'RE-2026-00007',
      sequenceValue: 7,
      year: 2026,
    });
  });

  it('rejects invalid allocation inputs and empty database results', async () => {
    const emptyTx = { $queryRaw: async () => [] };
    await assert.rejects(
      allocateInvoiceNumber(emptyTx, 'tenant-a', new Date('2026-01-01'), 'RE-{YYYY}-{00001}'),
      /returned no value/,
    );
    await assert.rejects(
      allocateInvoiceNumber(emptyTx, '', new Date('2026-01-01'), 'RE-{YYYY}-{00001}'),
      /tenantId/,
    );
  });
});
