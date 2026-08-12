import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

type PrismaMappedError = {
  statusCode: number;
  message: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const isProduction = process.env.NODE_ENV === 'production';
    const timestamp = new Date().toISOString();

    const prismaMapped = this.mapPrismaError(exception);
    const statusCode = prismaMapped?.statusCode ?? this.resolveStatusCode(exception);
    const message = prismaMapped?.message ?? this.resolveMessage(exception);
    const code = prismaMapped ? undefined : this.resolveMachineCode(exception);

    this.logException(exception, statusCode);

    if (isProduction) {
      response.status(statusCode).json({
        statusCode,
        message,
        timestamp,
        // `code` uretimde de tasiniyor. `details` burada kirpiliyor ve kod
        // yalnizca orada olsaydi istemci uretimde hata TURUNU ayirt edemez,
        // her dogrulama hatasini "genel hata" diye gostermek zorunda kalirdi.
        // Bu bir makine kodudur (ornegin adblue_must_be_additive) — sunucu ici
        // detay degil, sozlesmenin parcasi.
        ...(code ? { code } : {}),
      });
      return;
    }

    response.status(statusCode).json({
      statusCode,
      message,
      timestamp,
      ...(code ? { code } : {}),
      error: this.resolveErrorName(exception),
      details: this.resolveHttpExceptionDetails(exception),
    });
  }

  /**
   * Istisna govdesindeki makine-okunur `code` alanini cikarir.
   *
   * Yalnizca string bir `code` kabul edilir; govdenin geri kalani (ornegin
   * hangi urun/kullanim ucusunun cakistigi) `details` icinde kalir ve
   * uretimde disariya verilmez.
   */
  private resolveMachineCode(exception: unknown): string | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }

    const response = exception.getResponse();
    if (!response || typeof response !== 'object') {
      return undefined;
    }

    const code = (response as { code?: unknown }).code;
    return typeof code === 'string' && code.trim() ? code : undefined;
  }

  private mapPrismaError(exception: unknown): PrismaMappedError | null {
    if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
      return null;
    }

    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          message: 'A record with this value already exists',
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          message: 'Record not found',
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.BAD_REQUEST,
          message: 'Invalid reference',
        };
      default:
        return {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: 'An unexpected error occurred',
        };
    }
  }

  private resolveStatusCode(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return response;
      }
      if (response && typeof response === 'object' && 'message' in response) {
        const message = (response as { message?: unknown }).message;
        if (typeof message === 'string') {
          return message;
        }
        // class-validator (ValidationPipe) reports errors as a string array;
        // join them instead of masking them as "An unexpected error occurred".
        if (
          Array.isArray(message) &&
          message.length > 0 &&
          message.every((item): item is string => typeof item === 'string')
        ) {
          return message.join('; ');
        }
      }
      return exception.message;
    }

    return 'An unexpected error occurred';
  }

  private resolveErrorName(exception: unknown): string {
    if (exception instanceof Error) {
      return exception.name;
    }

    return 'UnknownError';
  }

  private resolveHttpExceptionDetails(exception: unknown): unknown {
    if (exception instanceof HttpException) {
      return exception.getResponse();
    }

    return undefined;
  }

  private logException(exception: unknown, statusCode: number): void {
    if (exception instanceof Error) {
      this.logger.error(
        `Unhandled exception (status ${statusCode}): ${exception.message}`,
        exception.stack,
      );
      return;
    }

    this.logger.error(`Unhandled non-error exception (status ${statusCode})`, String(exception));
  }
}