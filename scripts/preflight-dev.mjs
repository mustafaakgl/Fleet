#!/usr/bin/env node

import net from 'node:net';

const MIN_MAJOR = 20;
const MIN_MINOR_FOR_20 = 9;
const MAX_MAJOR_EXCLUSIVE = 23;
const port = Number.parseInt(process.env.FRONTEND_PORT || '3001', 10);

function fail(message) {
  console.error(`\n[preflight] ${message}\n`);
  process.exit(1);
}

function assertNodeVersion() {
  const version = process.versions.node;
  const [major, minor] = version.split('.').map((part) => Number.parseInt(part, 10));

  const tooOld = major < MIN_MAJOR || (major === MIN_MAJOR && minor < MIN_MINOR_FOR_20);
  const tooNew = major >= MAX_MAJOR_EXCLUSIVE;

  if (tooOld || tooNew) {
    fail(
      `Unsupported Node.js version ${version}. Use Node >=20.9 and <23 (recommended: 22 LTS).`,
    );
  }
}

function assertPortIsFree() {
  const server = net.createServer();

  server.once('error', (err) => {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
      fail(
        `Port ${port} is already in use. Stop stale dev servers first (example: pkill -f \"next dev\").`,
      );
    }

    fail(`Unable to validate port ${port}: ${String(err)}`);
  });

  server.once('listening', () => {
    server.close(() => {
      process.exit(0);
    });
  });

  server.listen(port);
}

assertNodeVersion();
assertPortIsFree();
