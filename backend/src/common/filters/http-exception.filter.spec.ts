import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ArgumentsHost, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
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
describe('HttpExceptionFilter validation messages', () => {
  it('joins class-validator array messages instead of masking them', () => {
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
    const exception = new BadRequestException([
      'date must be a valid ISO 8601 date string',
      'companyId should not be empty',
    ]);

    new HttpExceptionFilter().catch(exception, host);

    assert.ok(responseBody);
    assert.equal(responseBody.statusCode, HttpStatus.BAD_REQUEST);
    assert.equal(
      responseBody.message,
      'date must be a valid ISO 8601 date string; companyId should not be empty',
    );
    assert.equal(JSON.stringify(responseBody).includes('An unexpected error occurred'), false);
  });
});
