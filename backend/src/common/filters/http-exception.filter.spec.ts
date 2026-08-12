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
describe('HttpExceptionFilter machine-readable code', () => {
  function captureBody(exception: unknown, nodeEnv: string): Record<string, unknown> {
    const previousEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = nodeEnv;
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

    try {
      new HttpExceptionFilter().catch(exception, host);
    } finally {
      if (previousEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousEnv;
      }
    }

    assert.ok(responseBody);
    return responseBody;
  }

  it('carries the code in production, where details are stripped', () => {
    // Istemci hata TURUNU uretimde de ayirt edebilmeli: kod yalnizca
    // `details` icinde olsaydi arayuz her dogrulama hatasini "genel hata"
    // olarak gostermek zorunda kalirdi.
    const body = captureBody(
      new BadRequestException({ code: 'adblue_must_be_additive', productType: 'ADBLUE' }),
      'production',
    );

    assert.equal(body.code, 'adblue_must_be_additive');
    assert.equal('details' in body, false);
    // Govdenin geri kalani uretimde disariya verilmez.
    assert.equal(JSON.stringify(body).includes('productType'), false);
  });

  it('carries the code alongside details outside production', () => {
    const body = captureBody(
      new BadRequestException({ code: 'duplicate_fuel_compatibility_entry' }),
      'development',
    );

    assert.equal(body.code, 'duplicate_fuel_compatibility_entry');
    assert.notEqual(body.details, undefined);
  });

  it('omits the field entirely when the exception carries no code', () => {
    const body = captureBody(new BadRequestException('plain message'), 'production');

    assert.equal('code' in body, false);
  });

  it('ignores a non-string code', () => {
    const body = captureBody(new BadRequestException({ code: 42 }), 'production');

    assert.equal('code' in body, false);
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
