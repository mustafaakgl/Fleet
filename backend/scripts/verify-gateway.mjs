#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    const output = stderr || stdout || `exit=${result.status}`;
    throw new Error(output);
  }

  return (result.stdout || '').trim();
}

function parseLastJsonLine(text) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch {
      // continue searching
    }
  }

  throw new Error('codec8-sim output did not contain JSON summary');
}

async function main() {
  const backendDir = path.resolve(__dirname, '..');

  const simOutput = run(
    'node',
    ['scripts/codec8-sim.mjs', '--scenario', 'normal', '--seed', '42'],
    backendDir,
  );
  const summary = parseLastJsonLine(simOutput);

  if (typeof summary.ackRecords !== 'number' || summary.ackRecords <= 0) {
    throw new Error(`invalid ackRecords in simulator summary: ${JSON.stringify(summary)}`);
  }

  if (typeof summary.recordsSent !== 'number' || summary.recordsSent <= 0) {
    throw new Error(`invalid recordsSent in simulator summary: ${JSON.stringify(summary)}`);
  }

  process.stdout.write(`${JSON.stringify({
    ok: true,
    scenario: summary.scenario,
    imei: summary.imei,
    recordsSent: summary.recordsSent,
    ackRecords: summary.ackRecords,
  })}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[verify-gateway] ${message}`);
  process.exit(1);
});
