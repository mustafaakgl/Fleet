import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Telematik kontrolu paneli (Faz 11).
 *
 * Backend MOCK. Sinanan sey: hangi durumda ne gosteriliyor, ham kural kodunun
 * ekrana sizmamasi, suclayici bir metnin URETILEMEZ olmasi ve inceleme
 * akisinin cakismada dogru davranmasi.
 */

const reviewFn = vi.fn();

vi.mock('@/lib/api', () => ({
  fuelReconciliationApi: {
    review: (...args: unknown[]) => reviewFn(...args),
  },
}));

vi.mock('@/lib/fuel-station-view', () => ({
  extractApiErrorCode: (error: unknown) =>
    (error as { code?: string } | null)?.code ?? null,
}));

import type { FuelReconciliationPanel as Panel } from '@/lib/types';
import { FuelReconciliationPanel } from './FuelReconciliationPanel';

function panel(overrides: Partial<Panel> = {}): Panel {
  return {
    id: 'rec-1',
    fuelEntryId: 'r-1',
    status: 'calculated',
    riskLevel: 'normal',
    riskScore: 0,
    signals: [],
    dataQuality: {
      evaluatedRules: ['fuel_level_increase'],
      skippedRules: [],
      fuelLevelSamplesBefore: 3,
      fuelLevelSamplesAfter: 2,
      hasTankCapacity: true,
      hasStationLocation: true,
      hasPositions: true,
      hasFreshPriceSnapshot: true,
      missing: [],
    },
    evidence: {
      receiptLiters: 50,
      observedIncreaseLiters: 50,
      observedIncreasePct: 62.5,
      absoluteDifferenceLiters: 0,
      percentageDifference: 0,
      tankCapacityLiters: 80,
      levelRiseAt: '2026-08-14T10:05:00.000Z',
      receiptToRiseMinutes: 5,
      stationDistanceMeters: 120,
      closestPositionAt: '2026-08-14T10:00:00.000Z',
      quotedPricePerLitre: 1.74,
      receiptPricePerLiter: 1.75,
      priceDeviationRatio: 0.006,
      distanceSincePreviousReceiptKm: 600,
      expectedLitersFromDistance: 45,
      duplicateCandidateId: null,
    },
    algorithmVersion: 1,
    calculatedAt: '2026-08-14T11:00:00.000Z',
    recalculatedAt: null,
    review: { state: 'open', outcome: null, note: null, reviewedAt: null, reviewedBy: null },
    updatedAt: '2026-08-14T11:00:00.000Z',
    ...overrides,
  };
}

const HIGH = panel({
  riskLevel: 'high_attention',
  riskScore: 50,
  signals: [
    {
      code: 'no_fuel_level_increase',
      severity: 'strong',
      group: 'quantity',
      weight: 50,
      values: { receiptLiters: 50, observedIncreasePct: 0, sensorResolutionPct: 1 },
    },
  ],
});

describe('FuelReconciliationPanel', () => {
  beforeEach(() => {
    reviewFn.mockReset();
  });

  it('analiz yoksa panel hic cizilmez', () => {
    const { container } = render(<FuelReconciliationPanel panel={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('analiz beklerken "normal" gibi gorunen bos panel gostermez', () => {
    render(<FuelReconciliationPanel panel={panel({ status: 'pending' })} />);

    expect(screen.getByText('costs.fuelReconciliation.statusPending')).toBeDefined();
    expect(screen.queryByTestId('reconciliation-evidence')).toBeNull();
    expect(screen.queryByText('costs.fuelReconciliation.risk.normal')).toBeNull();
  });

  it('hesaplanamayan analiz teknik hata degil, "sonuc yok" der', () => {
    render(<FuelReconciliationPanel panel={panel({ status: 'failed' })} />);

    expect(screen.getByText('costs.fuelReconciliation.statusFailed')).toBeDefined();
  });

  it('risk seviyesi METIN olarak da gorunur — renk tek basina anlam tasimaz', () => {
    render(<FuelReconciliationPanel panel={HIGH} />);

    expect(screen.getByText('costs.fuelReconciliation.risk.high_attention')).toBeDefined();
  });

  it('kural kodu HAM haliyle gosterilmez, ceviri anahtarindan gecer', () => {
    render(<FuelReconciliationPanel panel={HIGH} />);

    const signals = screen.getByTestId('reconciliation-signals');
    expect(signals.textContent).toContain('costs.fuelReconciliation.signals.no_fuel_level_increase');
  });

  it('panelde suclayici bir ifade URETILEMEZ', () => {
    const { container } = render(<FuelReconciliationPanel panel={HIGH} />);
    const text = (container.textContent ?? '').toLowerCase();

    for (const word of ['diebstahl', 'betrug', 'theft', 'fraud', 'hirsizlik', 'hile']) {
      expect(text).not.toContain(word);
    }
  });

  it('olculemeyen degerler sifir degil "—" olarak gosterilir', () => {
    render(
      <FuelReconciliationPanel
        panel={panel({
          evidence: {
            ...panel().evidence!,
            observedIncreaseLiters: null,
            absoluteDifferenceLiters: null,
            stationDistanceMeters: null,
          },
        })}
      />,
    );

    const evidence = screen.getByTestId('reconciliation-evidence');
    // Uc alan olculemedi (artis, fark, mesafe) — ucu de "—" olmali. Sifir
    // yazsaydik "olctuk ve fark yok" demis olurduk.
    const dashes = (evidence.textContent ?? '').split('—').length - 1;
    expect(dashes).toBe(3);
    // Olculebilenler yerinde duruyor: 50 litrelik fis ve 80 litrelik depo.
    expect(evidence.textContent).toContain('50,0 l');
    expect(evidence.textContent).toContain('80,0 l');
  });

  it('eksik veriler ve ornek sayilari acikca yazilir', () => {
    render(
      <FuelReconciliationPanel
        panel={panel({
          riskLevel: 'insufficient_data',
          dataQuality: {
            ...panel().dataQuality!,
            hasTankCapacity: false,
            fuelLevelSamplesBefore: 0,
            fuelLevelSamplesAfter: 0,
            missing: ['missing_tank_capacity'],
          },
        })}
      />,
    );

    const missing = screen.getByTestId('reconciliation-missing');
    expect(missing.textContent).toContain('costs.fuelReconciliation.missing.missing_tank_capacity');
    expect(missing.textContent).toContain('"before":0');
  });

  it('normal ve yetersiz veri kayitlarinda inceleme formu ACILMAZ', () => {
    render(<FuelReconciliationPanel panel={panel()} />);
    expect(screen.queryByTestId('reconciliation-review-form')).toBeNull();

    render(<FuelReconciliationPanel panel={panel({ riskLevel: 'insufficient_data' })} />);
    expect(screen.queryByTestId('reconciliation-review-form')).toBeNull();
  });

  it('kapali inceleme yeniden kapatilamaz, sonucu ve notu gorunur', () => {
    render(
      <FuelReconciliationPanel
        panel={panel({
          riskLevel: 'high_attention',
          review: {
            state: 'closed',
            outcome: 'duplicate',
            note: 'Beleg lag doppelt vor.',
            reviewedAt: '2026-08-15T09:00:00.000Z',
            reviewedBy: { id: 'u-1', name: 'Ayşe Yılmaz' },
          },
        })}
      />,
    );

    expect(screen.getByTestId('reconciliation-closed').textContent).toContain(
      'Beleg lag doppelt vor.',
    );
    expect(screen.queryByTestId('reconciliation-review-form')).toBeNull();
  });

  it('not cok kisayken karar gonderilemez', async () => {
    const user = userEvent.setup();
    render(<FuelReconciliationPanel panel={HIGH} />);

    const submit = screen.getByTestId('reconciliation-review-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    await user.type(screen.getByPlaceholderText('costs.fuelReconciliation.notePlaceholder'), 'Geprüft und bestätigt');
    await waitFor(() => expect(submit.disabled).toBe(false));
  });

  it('karar gonderilirken beklenen updatedAt tasinir ve sonuc yukari bildirilir', async () => {
    const user = userEvent.setup();
    const onReviewed = vi.fn();
    const updated = panel({ review: { state: 'closed', outcome: 'valid', note: 'ok', reviewedAt: null, reviewedBy: null } });
    reviewFn.mockResolvedValue({ reconciliation: updated, changed: true });

    render(<FuelReconciliationPanel panel={HIGH} onReviewed={onReviewed} />);
    await user.type(screen.getByPlaceholderText('costs.fuelReconciliation.notePlaceholder'), 'Geprüft und bestätigt');
    await user.click(screen.getByTestId('reconciliation-review-submit'));

    await waitFor(() => expect(onReviewed).toHaveBeenCalledWith(updated));
    expect(reviewFn).toHaveBeenCalledWith('rec-1', {
      expectedUpdatedAt: '2026-08-14T11:00:00.000Z',
      outcome: 'valid',
      note: 'Geprüft und bestätigt',
    });
  });

  it('cakismada HAM hata kodu degil, cevrilmis mesaj gosterilir', async () => {
    const user = userEvent.setup();
    reviewFn.mockRejectedValue({ code: 'fuel_reconciliation_review_conflict' });

    render(<FuelReconciliationPanel panel={HIGH} />);
    await user.type(screen.getByPlaceholderText('costs.fuelReconciliation.notePlaceholder'), 'Geprüft und bestätigt');
    await user.click(screen.getByTestId('reconciliation-review-submit'));

    await waitFor(() =>
      expect(screen.getByText('costs.fuelReconciliation.errors.conflict')).toBeDefined(),
    );
    expect(screen.queryByText(/fuel_reconciliation_review_conflict/)).toBeNull();
  });
});
