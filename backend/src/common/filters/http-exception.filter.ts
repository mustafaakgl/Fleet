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

    this.logException(exception, statusCode);

    if (isProduction) {
      response.status(statusCode).json({
        statusCode,
        message,
        timestamp,
      });
      return;
    }

    response.status(statusCode).json({
      statusCode,
      message,
      timestamp,
      error: this.resolveErrorName(exception),
      details: this.resolveHttpExceptionDetails(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });
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
      if (
        response &&
        typeof response === 'object' &&
        'message' in response &&
        typeof (response as { message?: unknown }).message === 'string'
      ) {
        return (response as { message: string }).message;
      }
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