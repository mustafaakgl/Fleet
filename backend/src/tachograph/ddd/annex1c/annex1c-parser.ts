import { Logger } from '@nestjs/common';
import type { DddParserPort } from '../parser-port';
import type { ParsedDddResult } from '../parser-types';
import { emptyParsedDddResult } from '../parser-types';
import { parseAnnex1cCardFile } from './card-file-parser';
import { parseAnnex1cVuFile } from './vu-file-parser';
import { FileTrustStore } from './signature/file-trust-store';
import { extractSignedBlockPairs, verifyCardSignatures } from './signature/signature-verifier';
import type { TrustStore } from './signature/types';
import {
  isAnnex1cCardBuffer,
  isAnnex1cVuBuffer,
  parseCardTlvBlocks,
  parseVuTrepBlocks,
  TlvParseError,
} from './tlv';

const logger = new Logger('Annex1cDddParser');

export class Annex1cDddParser implements DddParserPort {
  constructor(private readonly trustStore: TrustStore = new FileTrustStore()) {}

  parse(buffer: Buffer): ParsedDddResult {
    try {
      if (isAnnex1cCardBuffer(buffer)) {
        const records = parseCardTlvBlocks(buffer);
        const parsed = parseAnnex1cCardFile(records);
        const pairs = extractSignedBlockPairs(records);
        parsed.signature = verifyCardSignatures(pairs, parsed.generation, this.trustStore);
        return parsed;
      }

      if (isAnnex1cVuBuffer(buffer)) {
        const blocks = parseVuTrepBlocks(buffer);
        return parseAnnex1cVuFile(blocks);
      }

      return emptyParsedDddResult(['Buffer is not a recognized Annex 1C card or VU file.']);
    } catch (error) {
      const message = error instanceof TlvParseError ? error.message : error instanceof Error ? error.message : String(error);
      logger.warn(`Annex 1C parse failed: ${message}`);
      return emptyParsedDddResult([`Annex 1C parse error: ${message}`]);
    }
  }
}

export function isAnnex1cBuffer(buffer: Buffer): boolean {
  return isAnnex1cCardBuffer(buffer) || isAnnex1cVuBuffer(buffer);
}
