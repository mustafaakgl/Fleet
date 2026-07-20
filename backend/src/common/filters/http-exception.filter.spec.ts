import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter response redaction', () => {
  it('does not expose server stack traces in non-production responses', () => {
    let responseBody: Record<string, unknown> | undefined;
    const response = {
      status: () => response,
      json: (body: Record<string, unknown>) => {
        responseBody = body;
        return response;
      },
    } as unknown as Response;
    const host = {
      switchToHttp: () => ({ getResponse: () => response }),
    } as unknown as ArgumentsHost;
    const exception = new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
    exception.stack = 'Error: test\n    at /private/server/path.ts:42:1';

    new HttpExceptionFilter().catch(exception, host);

    assert.ok(responseBody);
    assert.equal('stack' in responseBody, false);
    assert.equal(JSON.stringify(responseBody).includes('/private/server/path.ts'), false);
  });
});