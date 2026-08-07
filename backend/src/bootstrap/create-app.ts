import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../app.module';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter';
import { setupSwagger } from '../docs/swagger';
import {
  DOCUMENT_UPLOAD_RELATIVE_DIR,
  VEHICLE_PHOTO_UPLOAD_RELATIVE_DIR,
} from '../storage/local-storage.service';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.enableShutdownHooks();
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');

  // Behind a reverse proxy (public demo tunnel, load balancer) the socket peer is
  // always the proxy, so every visitor would share a single rate-limit bucket —
  // one person's sixth login attempt locks out everyone. Opting in makes Express
  // read X-Forwarded-For, which is what the throttler keys on. Off by default:
  // trusting that header while the app is directly reachable would let clients
  // spoof their address and walk past the limits altogether.
  const trustProxy = process.env.TRUST_PROXY?.trim();
  if (trustProxy) {
    const hops = Number(trustProxy);
    if (Number.isFinite(hops)) {
      app.set('trust proxy', hops);
    } else {
      app.set('trust proxy', trustProxy === 'true' ? true : trustProxy);
    }
  }

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

  app.useGlobalFilters(new HttpExceptionFilter());

  const documentsRoot = join(process.cwd(), DOCUMENT_UPLOAD_RELATIVE_DIR);
  const vehiclePhotosRoot = join(process.cwd(), VEHICLE_PHOTO_UPLOAD_RELATIVE_DIR);
  mkdirSync(documentsRoot, { recursive: true });
  mkdirSync(vehiclePhotosRoot, { recursive: true });

  setupSwagger(app);

  return app;
}