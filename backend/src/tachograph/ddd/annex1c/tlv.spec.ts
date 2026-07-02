import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCardTlvBlocks, TlvParseError } from './tlv';
import { encodeCardTlv } from './tlv';
import { EF_IDENTIFICATION_GEN1 } from './constants';

describe('Annex 1C TLV boundaries', () => {
  it('parses valid TLV chain', () => {
    const value = Buffer.from('CARD-TEST', 'ascii');
    const buffer = encodeCardTlv(EF_IDENTIFICATION_GEN1, 0x00, value);
    const records = parseCardTlvBlocks(buffer);
    assert.equal(records.length, 1);
    assert.equal(records[0].fid, EF_IDENTIFICATION_GEN1);
    assert.equal(records[0].value.toString('ascii'), 'CARD-TEST');
  });

  it('throws on truncated header', () => {
    assert.throws(() => parseCardTlvBlocks(Buffer.from([0x05, 0x20, 0x00])), TlvParseError);
  });

  it('throws on truncated value', () => {
    const buffer = Buffer.from([0x05, 0x20, 0x00, 0x00, 0x10]);
    assert.throws(() => parseCardTlvBlocks(buffer), TlvParseError);
  });
});
