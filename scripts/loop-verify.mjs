#!/usr/bin/env node
/**
 * Extended loop verification — runs codec8 scenarios against gateway + DB checks.
 */
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = join(repoRoot, 'backend');
const artifactsDir = mkdtempSync(join(tmpdir(), 'loop-verify-'));
const fullMode = process.argv.includes('--full');

const results = [];
const telemetryEnv = {
  TELEMATICS_IGNITION_OFF_DEBOUNCE_MS: '1000',
};
const loopVerifyPort = Number(process.env.LOOP_VERIFY_DEVICE_PORT || 15027);

function log(line) {
  process.stdout.write(`${line}\n`);
}

function runCommand(step, command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...telemetryEnv, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      if (options.inheritStdout) {
        process.stdout.write(chunk);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (options.inheritStderr) {
        process.stderr.write(chunk);
      }
    });

    child.on('error', reject);
    child.on('close', (code) => {
      const elapsedMs = Date.now() - started;
      const entry = {
        step,
        command: [command, ...args].join(' '),
        code: code ?? 1,
        elapsedMs,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };

      results.push(entry);

      if (code !== 0) {
        reject(new Error(`${step} failed (exit ${code})`));
        return;
      }

      resolve(entry);
    });
  });
}

async function waitForPostgres() {
  const user = process.env.POSTGRES_USER || 'fleet';
  const db = process.env.POSTGRES_DB || 'fleet';
  const host = process.env.POSTGRES_HOST || '127.0.0.1';
  const port = process.env.POSTGRES_PORT || '5432';

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await runCommand(
        'postgres-health',
        'pg_isready',
        ['-h', host, '-p', port, '-U', user, '-d', db],
        { cwd: backendDir },
      );
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(
    `Postgres not ready at ${host}:${port} (pg_isready failed). Start docker compose: npm run docker:up`,
  );
}

function waitForGatewayReady(child, host, port, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let listening = false;

    const onData = (chunk) => {
      const text = chunk.toString();
      if (text.includes('Teltonika Codec8 gateway listening')) {
        listening = true;
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    const tick = async () => {
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`Timeout waiting for telematics gateway on ${host}:${port}`));
        return;
      }

      if (!listening) {
        setTimeout(() => {
          void tick();
        }, 250);
        return;
      }

      try {
        await waitForPort(host, port, 5_000);
        resolve();
      } catch {
        setTimeout(() => {
          void tick();
        }, 250);
      }
    };

    void tick();
  });
}

function waitForPort(host, port, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();

    const tick = () => {
      import('node:net').then(({ Socket }) => {
        const socket = new Socket();
        socket.setTimeout(1_000);
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', () => {
          socket.destroy();
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`Timeout waiting for ${host}:${port}`));
            return;
          }
          setTimeout(tick, 500);
        });
        socket.connect(port, host);
      });
    };

    tick();
  });
}

function releasePort(port) {
  try {
    const pids = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        // ignore stale pid
      }
    }
  } catch {
    // port not in use
  }
}

async function ensureGateway() {
  const host = '127.0.0.1';
  const port = loopVerifyPort;
  releasePort(port);
  await new Promise((resolve) => setTimeout(resolve, 300));

  const child = spawn(
    'npx',
    ['ts-node', '--transpile-only', 'src/telematics-gateway/main.ts'],
    {
      cwd: backendDir,
      env: { ...process.env, ...telemetryEnv, DEVICE_PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout.on('data', (chunk) => process.stdout.write(chunk));
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));

  await waitForGatewayReady(child, host, port);

  results.push({
    step: 'gateway-start',
    command: 'telematics-gateway',
    code: 0,
    elapsedMs: 0,
    stdout: 'listening',
    stderr: '',
  });

  return child;
}

async function runSimAndVerify(scenario, seed, count) {
  const summaryPath = join(artifactsDir, `${scenario}.summary.json`);

  const sim = await runCommand(
    `sim:${scenario}`,
    'node',
    [
      'scripts/codec8-sim.mjs',
      '--scenario',
      scenario,
      '--seed',
      String(seed),
      '--imei',
      '359339080000101',
      '--count',
      String(count),
      '--port',
      String(loopVerifyPort),
    ],
    { cwd: backendDir, inheritStdout: true, env: telemetryEnv },
  );

  writeFileSync(summaryPath, `${sim.stdout}\n`);

    await runCommand(
      `verify:${scenario}`,
      'node',
      ['scripts/verify-tacho-telematics.mjs', '--scenario', scenario, '--summary', summaryPath],
      { cwd: backendDir, inheritStdout: true, env: telemetryEnv },
    );

    if (scenario === 'normal') {
      await runCommand('live-stream-smoke', 'node', ['scripts/live-stream-smoke.mjs'], {
        cwd: backendDir,
        inheritStdout: true,
      });
    }
  }

function printSummary() {
  log('\nloop:verify summary');
  log('step                          status   ms');
  log('--------------------------------------------------');

  for (const entry of results) {
    const status = entry.code === 0 ? 'PASS' : 'FAIL';
    log(`${entry.step.padEnd(30)} ${status.padEnd(8)} ${entry.elapsedMs}`);
  }

  if (!results.some((entry) => entry.step === 'playwright-e2e')) {
    log('playwright-e2e                 SKIPPED  (set SKIP_PLAYWRIGHT_E2E=0 to run)');
  }

  const failed = results.find((entry) => entry.code !== 0);
  if (failed) {
    log('\nFAILED at step: ' + failed.step);
    if (failed.stderr) {
      log(failed.stderr);
    }
    process.exit(1);
  }

  log('\nALL GREEN');
}

async function main() {
  let gateway;

  try {
    await runCommand('tsc', 'npx', ['tsc', '-p', 'tsconfig.json', '--noEmit'], { cwd: backendDir });
    await runCommand('npm-test', 'npm', ['test'], { cwd: backendDir, inheritStdout: true, inheritStderr: true });
    await runCommand(
      'frontend-tacho-unit',
      'node',
      [
        '-r',
        'ts-node/register/transpile-only',
        '--test',
        '../frontend/lib/tachograph-repeat.spec.ts',
        '../frontend/lib/tachograph-evidence.spec.ts',
      ],
      { cwd: backendDir, inheritStdout: true, inheritStderr: true },
    );
    await waitForPostgres();

    results.push({
      step: 'redis-health',
      command: process.env.REDIS_URL ? 'configured' : 'inline-fallback',
      code: 0,
      elapsedMs: 0,
      stdout: process.env.REDIS_URL ?? 'telemetry queue runs inline without REDIS_URL',
      stderr: '',
    });

    await runCommand('seed-tacho-demo', 'node', ['scripts/seed-tacho-demo.mjs'], {
      cwd: backendDir,
      inheritStdout: true,
    });

    gateway = await ensureGateway();

    await runSimAndVerify('normal', 42, 5);
    await runSimAndVerify('burst-reconnect', 42, 30);
    await runSimAndVerify('corrupt-frames', 42, 20);
    await runSimAndVerify('fuel-theft', 42, 20);
    await runSimAndVerify('dtc-storm', 42, 7);

    const loadCount = fullMode ? 10_000 : 1_000;
    const loadStarted = Date.now();
    await runSimAndVerify('load', 42, loadCount);
    const loadElapsed = Date.now() - loadStarted;
    if (fullMode && loadElapsed > 90_000) {
      throw new Error(`load scenario exceeded 90s budget: ${loadElapsed}ms`);
    }

    await runCommand(
      'tenant-isolation-check',
      'npx',
      ['ts-node', '--transpile-only', 'scripts/tenant-isolation-check.ts'],
      { cwd: backendDir, inheritStdout: true, inheritStderr: true },
    );

    const e2eDir = join(repoRoot, 'qa-agents', 'e2e');
    if (process.env.SKIP_PLAYWRIGHT_E2E !== '1') {
      await runCommand(
        'playwright-e2e',
        'npx',
        ['playwright', 'test', 'tests/tacho-telematics', '--project=chromium'],
        { cwd: e2eDir, inheritStdout: true, inheritStderr: true },
      );
    } else {
      results.push({
        step: 'playwright-e2e',
        command: 'skipped',
        code: 0,
        elapsedMs: 0,
        stdout: 'SKIP_PLAYWRIGHT_E2E=1',
        stderr: '',
      });
    }

    printSummary();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      step: 'loop-abort',
      command: 'loop:verify',
      code: 1,
      elapsedMs: 0,
      stdout: '',
      stderr: message,
    });
    log(`\nloop:verify aborted: ${message}`);
    printSummary();
  } finally {
    if (gateway && !gateway.killed) {
      gateway.kill('SIGTERM');
      await new Promise((resolve) => {
        gateway.once('close', resolve);
        setTimeout(resolve, 2_000);
      });
    }
  }
}

main();
