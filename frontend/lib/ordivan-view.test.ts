import { describe, expect, it } from 'vitest';
import {
  canSubmitDecision,
  checkTone,
  connectorStateKey,
  connectorTone,
  formatDuration,
  isCriticalField,
  isFastDecision,
  isLowConfidence,
  needsUpdate,
  protocolTone,
  resolveNoteRequirement,
} from './ordivan-view';
import type { OrdivanConnector } from './types';

function connector(overrides: Partial<OrdivanConnector> = {}): OrdivanConnector {
  return {
    id: 'conn-1',
    displayName: 'Buro-PC',
    status: 'active',
    online: true,
    lastHeartbeatAt: '2026-08-18T10:00:00.000Z',
    capabilities: ['system.echo'],
    connectorVersion: '0.1.0',
    protocolVersion: '1',
    protocolCompatibility: 'ok',
    platform: 'darwin',
    architecture: 'arm64',
    credentialPrefix: 'abcd1234',
    credentialIssuedAt: '2026-08-18T09:00:00.000Z',
    credentialRotatedAt: null,
    credentialRevokedAt: null,
    enrolledAt: '2026-08-18T09:00:00.000Z',
    ...overrides,
  };
}

describe('ordivan-view — connector', () => {
  it('cevrimici, cevrimdisi, bekleyen ve iptal ayri ton ve ayri metin', () => {
    const states = [
      connector({ online: true }),
      connector({ online: false }),
      connector({ status: 'pending_enrollment', online: false }),
      connector({ status: 'revoked', online: false }),
    ];
    const tones = states.map(connectorTone);
    const keys = states.map(connectorStateKey);

    expect(tones).toEqual(['positive', 'warning', 'neutral', 'danger']);
    expect(new Set(keys).size).toBe(4);
  });

  it('surum bildirmeyen connector YESIL gosterilmez', () => {
    expect(protocolTone('unknown')).toBe('neutral');
    expect(protocolTone('ok')).toBe('positive');
    expect(protocolTone('connector_too_old')).toBe('danger');
    expect(protocolTone('connector_too_new')).toBe('warning');
  });

  it('guncelleme yalnizca ESKI connector icin istenir', () => {
    expect(needsUpdate(connector({ protocolCompatibility: 'connector_too_old' }))).toBe(true);
    expect(needsUpdate(connector({ protocolCompatibility: 'unknown' }))).toBe(false);
    expect(needsUpdate(connector())).toBe(false);
  });
});

describe('ordivan-view — kontroller', () => {
  it('unknown ne yesil ne kirmizi: kendi basina bir durum', () => {
    expect(checkTone('verified')).toBe('positive');
    expect(checkTone('failed')).toBe('danger');
    expect(checkTone('unknown')).toBe('neutral');
  });
});

describe('ordivan-view — guven ve kritik alan', () => {
  const detail = { confidence: { documentKind: 0.42, pageCount: 0.99 }, lowConfidenceThreshold: 0.7 };

  it('esigin altindaki alan dusuk guvenli sayilir', () => {
    expect(isLowConfidence(detail, 'documentKind')).toBe(true);
    expect(isLowConfidence(detail, 'pageCount')).toBe(false);
    expect(isLowConfidence(detail, 'yok')).toBe(false);
  });

  it('kritik alan listesi oneri turune bagli', () => {
    expect(isCriticalField('document.classification', 'documentKind')).toBe(true);
    expect(isCriticalField('document.classification', 'pageCount')).toBe(false);
    expect(isCriticalField('system.echo_result', 'echoed')).toBe(false);
  });
});

describe('ordivan-view — karar gonderilebilir mi', () => {
  it('rutin onay aciklamasiz gonderilebilir', () => {
    expect(
      canSubmitDecision({
        decision: 'approved',
        note: '',
        fields: [{ fieldName: 'documentKind', changed: true, criticalLowConfidence: true }],
      }),
    ).toBe(true);
  });

  it('kritik + dusuk guvenli alan degistirilmeden onaylanirsa aciklama sart', () => {
    const fields = [{ fieldName: 'documentKind', changed: false, criticalLowConfidence: true }];
    expect(canSubmitDecision({ decision: 'approved', note: '', fields })).toBe(false);
    expect(canSubmitDecision({ decision: 'approved', note: 'Manuell geprüft', fields })).toBe(true);
    expect(resolveNoteRequirement({ decision: 'approved', fields })).toEqual({
      required: true,
      reason: 'critical_low_confidence_unchanged',
    });
  });

  it('red kategorisiz gonderilemez', () => {
    expect(
      canSubmitDecision({ decision: 'rejected', note: 'Passt nicht zum Beleg', fields: [] }),
    ).toBe(false);
    expect(
      canSubmitDecision({
        decision: 'rejected',
        rejectionCategory: 'incorrect_value',
        note: 'Passt nicht zum Beleg',
        fields: [],
      }),
    ).toBe(true);
  });

  it('red aciklamasiz gonderilemez', () => {
    expect(
      canSubmitDecision({
        decision: 'rejected',
        rejectionCategory: 'duplicate',
        note: '   ',
        fields: [],
      }),
    ).toBe(false);
  });

  it('"other" sebebi ayri gerekce ile isaretlenir', () => {
    expect(
      resolveNoteRequirement({ decision: 'rejected', rejectionCategory: 'other', fields: [] }),
    ).toEqual({ required: true, reason: 'rejection_category_other' });
  });
});

describe('ordivan-view — inceleme metrikleri', () => {
  it('hizli karar bir SINYAL olarak isaretlenir', () => {
    expect(isFastDecision(1200)).toBe(true);
    expect(isFastDecision(30_000)).toBe(false);
    expect(isFastDecision(null)).toBe(false);
  });

  it('sure okunabilir bicimde gosterilir, olculemezse bos doner', () => {
    expect(formatDuration(null, 'de-DE')).toBeNull();
    expect(formatDuration(4200, 'de-DE')).toBe('4 s');
    expect(formatDuration(90_000, 'de-DE')).toBe('1,5 min');
  });
});
