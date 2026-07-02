import { createPublicKey, createVerify, type KeyObject } from 'node:crypto';
import { CARD_RECORD_DATA, CARD_RECORD_SIGNATURE } from '../constants';
import type { CardTlvRecord } from '../tlv';
import type { DddGeneration, ParsedDddSignature } from '../../parser-types';
import type { SignedBlockPair, TrustStore } from './types';

export function extractSignedBlockPairs(records: CardTlvRecord[]): SignedBlockPair[] {
  const pairs: SignedBlockPair[] = [];

  for (let i = 0; i < records.length; i += 1) {
    const current = records[i];
    if (current.recordType !== CARD_RECORD_DATA) {
      continue;
    }

    const next = records[i + 1];
    if (next && next.recordType === CARD_RECORD_SIGNATURE && next.fid === current.fid) {
      pairs.push({
        fid: current.fid,
        data: current.value,
        signature: next.value,
      });
      i += 1;
    }
  }

  return pairs;
}

function verifyRsaSignature(data: Buffer, signature: Buffer, keys: KeyObject[]): boolean {
  // LEGAL-REVIEW: Production Annex 1B/1C Gen1 signatures may require SHA-1 + RSA PKCS#1 v1.5 per ERCA CPS.
  return keys.some((key) => {
    const verifier = createVerify('RSA-SHA256');
    verifier.update(data);
    verifier.end();
    try {
      return verifier.verify(key, signature);
    } catch {
      return false;
    }
  });
}

function verifyEcdsaSignature(data: Buffer, signature: Buffer, keys: KeyObject[]): boolean {
  // LEGAL-REVIEW: Gen2 ECDSA curve/hash parameters must match ERCA certificate policy.
  return keys.some((key) => {
    const verifier = createVerify('SHA256');
    verifier.update(data);
    verifier.end();
    try {
      return verifier.verify({ key, dsaEncoding: 'ieee-p1363' }, signature);
    } catch {
      return false;
    }
  });
}

export function verifyCardSignatures(
  pairs: SignedBlockPair[],
  generation: DddGeneration,
  trustStore: TrustStore,
): ParsedDddSignature {
  if (pairs.length === 0) {
    return { checked: false, valid: null, details: ['No signed data blocks found'] };
  }

  if (!trustStore.configured) {
    return {
      checked: true,
      valid: null,
      details: ['trust store not configured'],
    };
  }

  const rsaKeys = trustStore.getRsaPublicKeys().map((der) => createPublicKey({ key: der, format: 'der', type: 'spki' }));
  const ecdsaKeys = trustStore
    .getEcdsaPublicKeys()
    .map((der) => createPublicKey({ key: der, format: 'der', type: 'spki' }));

  const details: string[] = [];
  let allValid = true;

  for (const pair of pairs) {
    const label = `0x${pair.fid.toString(16).padStart(4, '0')}`;
    const useEcdsa = generation === 2;
    const valid = useEcdsa
      ? verifyEcdsaSignature(pair.data, pair.signature, ecdsaKeys)
      : verifyRsaSignature(pair.data, pair.signature, rsaKeys);

    if (!valid) {
      allValid = false;
      details.push(`Invalid signature for EF ${label}`);
    } else {
      details.push(`Valid signature for EF ${label}`);
    }
  }

  return {
    checked: true,
    valid: allValid,
    details,
  };
}
