import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Readable } from 'node:stream';
import { BadRequestException } from '@nestjs/common';
import {
  assertMessengerAttachmentsInput,
  MESSENGER_ATTACHMENT_MAX_COUNT,
  sanitizeAttachmentFileName,
} from './messenger-attachments.util';

function buildFile(params: {
  name: string;
  mimetype: string;
  size: number;
}): Express.Multer.File {
  return {
    fieldname: 'attachments',
    originalname: params.name,
    encoding: '7bit',
    mimetype: params.mimetype,
    size: params.size,
    destination: '',
    filename: params.name,
    path: '',
    stream: Readable.from(Buffer.alloc(0)),
    buffer: Buffer.alloc(Math.min(params.size, 8)),
  };
}

describe('messenger-attachments.util', () => {
  it('accepts up to 3 valid attachments', () => {
    const files = [
      buildFile({ name: 'a.pdf', mimetype: 'application/pdf', size: 1024 }),
      buildFile({ name: 'b.jpg', mimetype: 'image/jpeg', size: 2048 }),
      buildFile({ name: 'c.webp', mimetype: 'image/webp', size: 4096 }),
    ];

    assert.doesNotThrow(() => assertMessengerAttachmentsInput(files));
  });

  it('rejects unsupported file types', () => {
    const files = [buildFile({ name: 'a.txt', mimetype: 'text/plain', size: 200 })];

    assert.throws(
      () => assertMessengerAttachmentsInput(files),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it('rejects more than maximum attachment count', () => {
    const files = Array.from({ length: MESSENGER_ATTACHMENT_MAX_COUNT + 1 }, (_, index) =>
      buildFile({ name: `f-${index}.pdf`, mimetype: 'application/pdf', size: 1000 }),
    );

    assert.throws(
      () => assertMessengerAttachmentsInput(files),
      (error: unknown) => error instanceof BadRequestException,
    );
  });

  it('sanitizes risky file names', () => {
    const sanitized = sanitizeAttachmentFileName('../../evil?.pdf');
    assert.equal(sanitized.includes('/'), false);
    assert.equal(sanitized.includes('\\'), false);
    assert.equal(sanitized.endsWith('.pdf'), true);
  });
});
