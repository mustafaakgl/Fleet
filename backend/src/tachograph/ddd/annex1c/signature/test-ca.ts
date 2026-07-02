import { generateKeyPairSync, type KeyObject } from 'node:crypto';

let cachedKeys: { privateKey: KeyObject; publicKey: KeyObject } | null = null;

/** Ephemeral test CA key pair — generated once per process for fixture signature tests. */
export function getTestCaKeyPair(): { privateKey: KeyObject; publicKey: KeyObject } {
  if (!cachedKeys) {
    cachedKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  }
  return cachedKeys;
}
