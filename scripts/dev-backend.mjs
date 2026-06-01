#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const backendPort = Number.parseInt(process.env.BACKEND_PORT || '3000', 10);

function fail(message) {
  process.stderr.write(`\n[dev-backend] ${message}\n\n`);
  process.exit(1);
}

function parsePids(rawOutput) {
  return rawOutput
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => Number.parseInt(line, 10))
    .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
}

function listListeningPids(port) {
  try {
    const output = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return parsePids(output);
  } catch {
    return [];
  }
}

function killPid(pid, signal) {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

function ensurePortIsFree(port) {
  if (!Number.isInteger(port) || port <= 0) {
    fail(`Invalid BACKEND_PORT value: ${port}`);
  }

  const pids = listListeningPids(port);
  if (pids.length === 0) {
    return;
  }

  process.stdout.write(`[dev-backend] Port ${port} is busy. Terminating process(es): ${pids.join(', ')}\n`);
  for (const pid of pids) {
    killPid(pid, 'SIGTERM');
  }

  const remainingAfterTerm = listListeningPids(port);
  for (const pid of remainingAfterTerm) {
    killPid(pid, 'SIGKILL');
  }

  const stillBusy = listListeningPids(port);
  if (stillBusy.length > 0) {
    fail(`Could not free port ${port}. Remaining process(es): ${stillBusy.join(', ')}`);
  }
}

function main() {
  ensurePortIsFree(backendPort);

  const env = {
    ...process.env,
    PORT: process.env.PORT || String(backendPort),
  };

  const child = spawn('npm', ['--prefix', 'backend', 'run', 'start:dev'], {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    fail(`Failed to start backend: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(128 + (signal === 'SIGTERM' ? 15 : 0));
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
