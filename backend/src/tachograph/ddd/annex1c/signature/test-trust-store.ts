import type { KeyObject } from 'node:crypto';
import type { TrustStore } from './types';
import { getTestCaKeyPair } from './test-ca';

export class TestTrustStore implements TrustStore {
  private readonly publicKey: KeyObject;

  constructor() {
    this.publicKey = getTestCaKeyPair().publicKey;
  }

  get configured(): boolean {
    return true;
  }

  getRsaPublicKeys(): Buffer[] {
    return [this.publicKey.export({ type: 'spki', format: 'der' })];
  }

  getEcdsaPublicKeys(): Buffer[] {
    return [];
  }

  getRsaKeyObject(): KeyObject {
    return this.publicKey;
  }
}
