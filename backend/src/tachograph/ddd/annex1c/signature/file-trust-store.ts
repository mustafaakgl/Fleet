import { createPublicKey, type KeyObject } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TrustStore } from './types';

function loadPemFiles(dir: string): Buffer[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith('.pem') || name.endsWith('.crt') || name.endsWith('.cer'))
    .map((name) => readFileSync(join(dir, name)));
}

export class FileTrustStore implements TrustStore {
  private readonly rsaKeys: KeyObject[];
  private readonly ecdsaKeys: KeyObject[];

  constructor(trustDir = join(process.cwd(), 'config', 'tacho-trust')) {
    const pemBuffers = loadPemFiles(trustDir);
    this.rsaKeys = [];
    this.ecdsaKeys = [];

    for (const pem of pemBuffers) {
      try {
        const key = createPublicKey(pem);
        const type = key.asymmetricKeyType;
        if (type === 'rsa') {
          this.rsaKeys.push(key);
        } else if (type === 'ec') {
          this.ecdsaKeys.push(key);
        }
      } catch {
        // Skip unreadable trust material.
      }
    }
  }

  get configured(): boolean {
    return this.rsaKeys.length > 0 || this.ecdsaKeys.length > 0;
  }

  getRsaPublicKeys(): Buffer[] {
    return this.rsaKeys.map((key) => key.export({ type: 'spki', format: 'der' }));
  }

  getEcdsaPublicKeys(): Buffer[] {
    return this.ecdsaKeys.map((key) => key.export({ type: 'spki', format: 'der' }));
  }

  getRsaKeyObjects(): KeyObject[] {
    return this.rsaKeys;
  }

  getEcdsaKeyObjects(): KeyObject[] {
    return this.ecdsaKeys;
  }
}
