import type { DddParserPort } from './parser-port';
import type { ParsedDddResult } from './parser-types';
import { Annex1cDddParser, isAnnex1cBuffer } from './annex1c/annex1c-parser';
import { SyntheticDddParser } from './synthetic-ddd-parser';

export class CompositeDddParser implements DddParserPort {
  constructor(
    private readonly annex1c: DddParserPort = new Annex1cDddParser(),
    private readonly synthetic: DddParserPort = new SyntheticDddParser(),
  ) {}

  parse(buffer: Buffer): ParsedDddResult {
    if (isAnnex1cBuffer(buffer)) {
      return this.annex1c.parse(buffer);
    }

    const result = this.synthetic.parse(buffer);
    result.warnings.push('Fell back to synthetic DDD parser (not Annex 1C structure).');
    return result;
  }
}

const defaultParser = new CompositeDddParser();

export function parseDddBuffer(buffer: Buffer): ParsedDddResult {
  return defaultParser.parse(buffer);
}
