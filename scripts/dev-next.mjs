#!/usr/bin/env node

import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const command = process.argv[2];
const forwardedArgs = process.argv.slice(3);
const port = Number.parseInt(process.env.FRONTEND_PORT || '3001', 10);
const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const frontendDir = path.join(rootDir, 'frontend');
const nextBin = path.join(frontendDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const preferredNode = '/opt/homebrew/opt/node@22/bin/node';

function isSupportedVersion(version) {
  const [majorRaw, minorRaw] = version.split('.');
  const major = Number.parseInt(majorRaw, 10);
  const minor = Number.parseInt(minorRaw, 10);
  return major > 20 && major < 23 || (major === 20 && minor >= 9);
}

function readNodeVersion(nodePath) {
  const result = spawnSync(nodePath, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim();
}

function pickNodeBinary() {
  const candidates = [preferredNode, process.execPath];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const version = readNodeVersion(candidate);
    if (version && isSupportedVersion(version)) {
      return { nodePath: candidate, version };
    }
  }

  return null;
}

function fail(message) {
  console.error(`\n[dev] ${message}\n`);
  process.exit(1);
}

function assertPortIsFree() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Stop stale dev servers first.`));
        return;
      }

      reject(error instanceof Error ? error : new Error(String(error)));
    });

    server.once('listening', () => {
      server.close(() => resolve(undefined));
    });

    server.listen(port, '127.0.0.1');
  });
}

function waitForPortListening(timeoutMs = 180000, intervalMs = 500) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const socket = net.createConnection({ port, host: '127.0.0.1' });

      socket.once('connect', () => {
        socket.end();
        resolve(undefined);
      });

      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Next.js did not start listening on port ${port} within ${Math.round(timeoutMs / 1000)}s.`));
          return;
        }

        setTimeout(check, intervalMs);
      });
    };

    check();
  });
}

async function main() {
  if (!command || !['dev', 'start'].includes(command)) {
    fail('Usage: node scripts/dev-next.mjs <dev|start>');
  }

  if (!fs.existsSync(nextBin)) {
    fail(`Cannot find Next.js binary at ${nextBin}. Run npm install in frontend first.`);
  }

  const nodeChoice = pickNodeBinary();
  if (!nodeChoice) {
    fail('No supported Node.js found. Install Node 22 LTS or Node >=20.9 and <23.');
  }

  await assertPortIsFree();

  const args = [nextBin, command, '--port', String(port), ...forwardedArgs];
  const child = spawn(nodeChoice.nodePath, args, {
    cwd: frontendDir,
    env: process.env,
    stdio: 'inherit',
  });

  if (command === 'dev') {
    waitForPortListening().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\n[dev] ${message}`);
      console.error('[dev] Check frontend/.env.local and ensure no stale Next.js process is hanging.');
      try {
        child.kill('SIGTERM');
      } catch {
        // noop
      }
      process.exit(1);
    });
  }

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(128 + (signal === 'SIGTERM' ? 15 : 0));
      return;
    }

    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
