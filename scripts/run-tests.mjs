#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const backendRoot = path.join(repoRoot, 'backend');
const backendSrcRoot = path.join(backendRoot, 'src');

async function collectSpecFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map(async (entry) => {
        const absolutePath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return collectSpecFiles(absolutePath);
        }
        if (entry.isFile() && entry.name.endsWith('.spec.ts')) {
          return [path.relative(backendRoot, absolutePath).split(path.sep).join('/')];
        }
        return [];
      }),
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}

function parseNodeTestSummary(output) {
  const readMetric = (label) => {
    const match = output.match(new RegExp(`(?:ℹ|#) ${label} (\\d+)`));
    return match ? Number(match[1]) : null;
  };

  return {
    tests: readMetric('tests'),
    pass: readMetric('pass'),
    fail: readMetric('fail'),
  };
}

async function main() {
  const specFiles = await collectSpecFiles(backendSrcRoot);
  if (specFiles.length === 0) {
    console.error('[run-tests] no backend spec files found under backend/src');
    process.exit(1);
  }

  console.log(`[run-tests] discovered spec files=${specFiles.length}`);

  const child = spawn(process.execPath, ['-r', 'ts-node/register/transpile-only', '--test', ...specFiles], {
    cwd: backendRoot,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    process.stdout.write(text);
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    process.stderr.write(text);
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });

  const summary = parseNodeTestSummary(`${stdout}\n${stderr}`);
  console.log(
    `[run-tests] summary spec_files=${specFiles.length} tests=${summary.tests ?? 'unknown'} pass=${summary.pass ?? 'unknown'} fail=${summary.fail ?? 'unknown'}`,
  );

  process.exit(typeof exitCode === 'number' ? exitCode : 1);
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(`[run-tests] failed ${message}`);
  process.exit(1);
});