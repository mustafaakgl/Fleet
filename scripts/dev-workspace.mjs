#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const frontendPort = Number.parseInt(process.env.FRONTEND_PORT || '3001', 10);
const backendPort = Number.parseInt(process.env.BACKEND_PORT || '3000', 10);
const managedPorts = [backendPort, frontendPort];
const startBackend = String(process.env.START_BACKEND_ON_DEV ?? 'true').toLowerCase() !== 'false';

function log(message) {
  process.stdout.write(`[dev] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`\n[dev] ${message}\n\n`);
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

function terminatePortOwners(port) {
  const pids = listListeningPids(port);
  if (pids.length === 0) {
    return;
  }

  log(`Port ${port} is busy. Terminating process(es): ${pids.join(', ')}`);

  for (const pid of pids) {
    killPid(pid, 'SIGTERM');
  }

  const remainingAfterTerm = listListeningPids(port);
  for (const pid of remainingAfterTerm) {
    killPid(pid, 'SIGKILL');
  }

  const remainingAfterKill = listListeningPids(port);
  if (remainingAfterKill.length > 0) {
    fail(`Could not free port ${port}. Remaining process(es): ${remainingAfterKill.join(', ')}`);
  }
}

function ensurePortsFree() {
  for (const port of managedPorts) {
    if (!Number.isInteger(port) || port <= 0) {
      fail(`Invalid port configuration detected: ${port}`);
    }
    terminatePortOwners(port);
  }
}

function spawnChild(command, args, label) {
  const child = spawn(command, args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    fail(`${label} failed to start: ${error.message}`);
  });

  return child;
}

function terminateChild(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode) {
    return;
  }

  try {
    child.kill(signal);
  } catch {
    // noop
  }
}

function main() {
  ensurePortsFree();
  const forwardedFrontendArgs = process.argv.slice(2);

  let backend = null;
  if (startBackend) {
    log(`Starting backend on port ${backendPort}`);
    backend = spawnChild('npm', ['--prefix', 'backend', 'run', 'start:dev'], 'Backend');
  } else {
    log(`Backend autostart is disabled (port ${backendPort} is still reserved/cleaned).`);
  }

  log(`Starting frontend on port ${frontendPort}`);
  const frontend = spawnChild(
    process.execPath,
    [path.join(rootDir, 'scripts', 'dev-next.mjs'), 'dev', ...forwardedFrontendArgs],
    'Frontend',
  );

  let shuttingDown = false;

  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    terminateChild(frontend, signal);
    terminateChild(backend, signal);
  };

  const handleExit = (label, code, signal) => {
    if (!shuttingDown) {
      shuttingDown = true;
      const exitInfo = signal ? `signal ${signal}` : `code ${code ?? 0}`;
      log(`${label} exited with ${exitInfo}. Stopping other process.`);
      terminateChild(frontend, 'SIGTERM');
      terminateChild(backend, 'SIGTERM');
      process.exit(code ?? 0);
    }
  };

  if (backend) {
    backend.on('exit', (code, signal) => handleExit('Backend', code, signal));
  }
  frontend.on('exit', (code, signal) => handleExit('Frontend', code, signal));

  process.on('SIGINT', () => {
    shutdown('SIGINT');
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
    process.exit(143);
  });
}

main();
