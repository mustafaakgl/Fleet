import 'dotenv/config';
import './config/env.bootstrap';
import { initSentry } from './config/sentry.bootstrap';

initSentry();
import 'reflect-metadata';
import './prisma-enum-polyfill';
import { createApp } from './bootstrap/create-app';

async function bootstrap() {
  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  console.log('[boot] bootstrap started');
  const app = await createApp();

  console.log('[boot] Nest app created');
  await app.listen(port);
  console.log(`[boot] listening on ${port}`);
}

void bootstrap();
