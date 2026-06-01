import 'dotenv/config';
import 'reflect-metadata';
import './prisma-enum-polyfill';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { DOCUMENT_UPLOAD_RELATIVE_DIR } from './storage/local-storage.service';

async function bootstrap() {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  console.log('[boot] bootstrap started');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(','),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  const uploadsRoot = join(process.cwd(), 'uploads');
  const documentsRoot = join(process.cwd(), DOCUMENT_UPLOAD_RELATIVE_DIR);
  mkdirSync(documentsRoot, { recursive: true });
  app.useStaticAssets(uploadsRoot, {
    prefix: '/uploads',
  });

  console.log('[boot] Nest app created');
  await app.listen(port);
  console.log(`[boot] listening on ${port}`);
}

void bootstrap();
