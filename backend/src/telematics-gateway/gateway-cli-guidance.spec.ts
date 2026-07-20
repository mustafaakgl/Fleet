import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

const backendRoot = resolve(__dirname, '../..');
const expectedEntryPoint = 'ts-node --transpile-only src/telematics-gateway/main.ts';
const expectedCommand = 'npm --prefix backend run start:gateway';

describe('telematics gateway CLI guidance', () => {
  it('exposes a package script for the standalone gateway entrypoint', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(backendRoot, 'package.json'), 'utf8'),
    ) as { scripts?: Record<string, string> };

    assert.equal(packageJson.scripts?.['start:gateway'], expectedEntryPoint);
  });

  for (const script of ['codec8-sim.mjs', 'verify-tacho-telematics.mjs']) {
    it(`${script} points unavailable-gateway errors to the gateway process`, () => {
      const source = readFileSync(resolve(backendRoot, 'scripts', script), 'utf8');

      assert.match(source, new RegExp(expectedCommand.replaceAll(':', '\\:')));
      assert.doesNotMatch(source, /GATEWAY_START_COMMAND = .*start:dev/);
    });
  }
});