import type { ParsedDddResult } from './parser-types';

export interface DddParserPort {
  parse(buffer: Buffer): ParsedDddResult;
}
