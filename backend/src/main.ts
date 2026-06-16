import 'dotenv/config';
import './config/env.bootstrap';
import { initSentry } from './config/sentry.bootstrap';

initSentry();
import 'reflect-metadata';
import './prisma-enum-polyfill';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import {
  DOCUMENT_UPLOAD_RELATIVE_DIR,
  VEHICLE_PHOTO_UPLOAD_RELATIVE_DIR,
} from './storage/local-storage.service';

async function bootstrap() {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  console.log('[boot] bootstrap started');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.enableShutdownHooks();

  app.use(helmet());
  app.use(cookieParser());

  app.setGlobalPrefix('api/v1');

  const defaultCorsOrigins = [
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:8081',
    'http://127.0.0.1:8081',
    'http://localhost:19006',
    'http://127.0.0.1:19006',
  ];
  const corsOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
    : defaultCorsOrigins;

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  const documentsRoot = join(process.cwd(), DOCUMENT_UPLOAD_RELATIVE_DIR);
  const vehiclePhotosRoot = join(process.cwd(), VEHICLE_PHOTO_UPLOAD_RELATIVE_DIR);
  mkdirSync(documentsRoot, { recursive: true });
  mkdirSync(vehiclePhotosRoot, { recursive: true });

  console.log('[boot] Nest app created');
  await app.listen(port);
  console.log(`[boot] listening on ${port}`);
}

void bootstrap();
