import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OrdivanConfigError,
  evaluateProtocolCompatibility,
  isOrdivanEnabled,
  resolveOrdivanMode,
} from '../ordivan.config';

describe('ordivan.config', () => {
  it('yapilandirma yoksa varsayilan disabled — sessizce otomasyona baglanmaz', () => {
    assert.equal(resolveOrdivanMode(undefined, 'development'), 'disabled');
    assert.equal(resolveOrdivanMode('', 'production'), 'disabled');
  });

  it('mock uretimde REDDEDILIR', () => {
    assert.throws(
      () => resolveOrdivanMode('mock', 'production'),
      (error: unknown) => {
        assert.ok(error instanceof OrdivanConfigError);
        assert.match((error as Error).message, /refused in production/);
        return true;
      },
    );
  });

  it('mock development/test icinde gecerlidir', () => {
    assert.equal(resolveOrdivanMode('mock', 'development'), 'mock');
    assert.equal(resolveOrdivanMode('mock', 'test'), 'mock');
  });

  it('local uretimde de gecerlidir', () => {
    assert.equal(resolveOrdivanMode('local', 'production'), 'local');
  });

  it('taninmayan mod firlatir', () => {
    assert.throws(() => resolveOrdivanMode('yes-please', 'development'), OrdivanConfigError);
  });

  it('disabled modda uclar kapali, digerlerinde acik', () => {
    assert.equal(isOrdivanEnabled('disabled'), false);
    assert.equal(isOrdivanEnabled('mock'), true);
    assert.equal(isOrdivanEnabled('local'), true);
  });

  it('surum bildirmeyen connector "uyumlu" SAYILMAZ', () => {
    assert.equal(evaluateProtocolCompatibility(undefined), 'unknown');
    assert.equal(evaluateProtocolCompatibility('bilinmiyor'), 'unknown');
    assert.equal(evaluateProtocolCompatibility('1'), 'ok');
    assert.equal(evaluateProtocolCompatibility('0'), 'connector_too_old');
    assert.equal(evaluateProtocolCompatibility('9'), 'connector_too_new');
  });
});
