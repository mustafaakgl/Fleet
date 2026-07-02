import 'dotenv/config';
import '../config/env.bootstrap';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { MetricsService } from '../metrics/metrics.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelemetryQueueService } from '../queue/telemetry-queue.service';
import { TeltonikaGatewayService } from './teltonika-gateway.service';

async function bootstrapGateway() {
  const logger = new Logger('TelematicsGatewayBootstrap');
  const port = Number(process.env.DEVICE_PORT ?? 5027);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  const prisma = app.get(PrismaService);
  const telemetryQueue = app.get(TelemetryQueueService);
  const metrics = app.get(MetricsService);
  const gateway = new TeltonikaGatewayService(prisma, telemetryQueue, metrics, port);

  await gateway.start();

  const shutdown = async () => {
    logger.log('shutdown signal received');
    await gateway.stop();
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

void bootstrapGateway();
