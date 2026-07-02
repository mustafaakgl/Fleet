import type { ParsedDddSignature } from '../../parser-types';

export type SignatureAlgorithm = 'rsa-sha256' | 'ecdsa-sha256';

export interface TrustStore {
  readonly configured: boolean;
  getRsaPublicKeys(): Buffer[];
  getEcdsaPublicKeys(): Buffer[];
}

export type SignedBlockPair = {
  fid: number;
  data: Buffer;
  signature: Buffer;
};

export type SignatureVerifyResult = ParsedDddSignature;
