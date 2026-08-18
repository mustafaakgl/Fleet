import { describe, expect, it } from 'vitest';
import {
  canReviewReconciliation,
  formatLiters,
  formatMeters,
  missingDataLabelKey,
  panelState,
  riskLabelKey,
  riskTone,
  signalLabelKey,
  sortedSignals,
} from './fuel-reconciliation-view';
import type { FuelReconciliationPanel, FuelReconciliationSignal } from './types';

function panel(overrides: Partial<FuelReconciliationPanel> = {}): FuelReconciliationPanel {
  return {
    id: 'rec-1',
    fuelEntryId: 'r-1',
    status: 'calculated',
    riskLevel: 'normal',
    riskScore: 0,
    signals: [],
    dataQuality: null,
    evidence: null,
    algorithmVersion: 1,
    calculatedAt: '2026-08-14T11:00:00.000Z',
    recalculatedAt: null,
    review: { state: 'open', outcome: null, note: null, reviewedAt: null, reviewedBy: null },
    updatedAt: '2026-08-14T11:00:00.000Z',
    ...overrides,
  };
}

function signal(code: string, severity: 'strong' | 'moderate'): FuelReconciliationSignal {
  return { code, severity, group: 'quantity', weight: severity === 'strong' ? 50 : 20, values: {} };
}

describe('fuel-reconciliation-view', () => {
  it('her risk seviyesi ayri bir ton ve ayri bir ceviri anahtari tasir', () => {
    const levels = ['insufficient_data', 'normal', 'review_required', 'high_attention'] as const;
    const tones = levels.map(riskTone);
    const keys = levels.map(riskLabelKey);

    expect(new Set(tones).size).toBe(levels.length);
    expect(new Set(keys).size).toBe(levels.length);
    expect(keys).toContain('costs.fuelReconciliation.risk.high_attention');
  });

  it('kural kodu ham gosterilmez, ceviri anahtarina cevrilir', () => {
    expect(signalLabelKey('no_fuel_level_increase')).toBe(
      'costs.fuelReconciliation.signals.no_fuel_level_increase',
    );
    expect(missingDataLabelKey('missing_tank_capacity')).toBe(
      'costs.fuelReconciliation.missing.missing_tank_capacity',
    );
  });

  it('panel durumu: analiz yoksa/beklerse hazir gibi gosterilmez', () => {
    expect(panelState(null)).toBe('absent');
    expect(panelState(panel({ status: 'pending' }))).toBe('pending');
    expect(panelState(panel({ status: 'failed' }))).toBe('failed');
    expect(panelState(panel())).toBe('ready');
  });

  it('guclu sinyaller once siralanir', () => {
    const sorted = sortedSignals([
      signal('b_moderate', 'moderate'),
      signal('a_strong', 'strong'),
      signal('a_moderate', 'moderate'),
    ]);
    expect(sorted.map((item) => item.code)).toEqual(['a_strong', 'a_moderate', 'b_moderate']);
  });

  it('inceleme yalnizca acik ve karar gerektiren kayitlarda mumkun', () => {
    expect(canReviewReconciliation(panel({ riskLevel: 'high_attention' }))).toBe(true);
    expect(canReviewReconciliation(panel({ riskLevel: 'review_required' }))).toBe(true);
    expect(canReviewReconciliation(panel({ riskLevel: 'normal' }))).toBe(false);
    expect(canReviewReconciliation(panel({ riskLevel: 'insufficient_data' }))).toBe(false);
    expect(
      canReviewReconciliation(
        panel({
          riskLevel: 'high_attention',
          review: { state: 'closed', outcome: 'valid', note: 'ok', reviewedAt: null, reviewedBy: null },
        }),
      ),
    ).toBe(false);
    expect(canReviewReconciliation(panel({ status: 'pending', riskLevel: 'high_attention' }))).toBe(
      false,
    );
  });

  it('olculemeyen deger sifir olarak degil, bos olarak doner', () => {
    expect(formatLiters(null, 'de-DE')).toBeNull();
    expect(formatLiters(Number.NaN, 'de-DE')).toBeNull();
    expect(formatLiters(0, 'de-DE')).toBe('0,0 l');
    expect(formatMeters(null, 'de-DE')).toBeNull();
    expect(formatMeters(450, 'de-DE')).toBe('450 m');
    expect(formatMeters(2400, 'de-DE')).toBe('2,4 km');
  });
});
