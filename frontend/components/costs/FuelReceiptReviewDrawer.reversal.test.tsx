import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Inceleme cekmecesinin ters kayit davranisi — GERCEK render.
 *
 * Sinanan sey: dugmenin NE ZAMAN cikip cikmadigi, rozetin ve maliyet
 * aciklamasinin gorunmesi, zincirde gezinme ve duzeltme formunun
 * kaydetmekle onaylamamasi.
 */
const detailFn = vi.fn();
const updateCorrection = vi.fn();

vi.mock('@/lib/api', () => ({
  fuelReceiptReviewApi: {
    detail: (...args: unknown[]) => detailFn(...args),
    approve: vi.fn(),
    reject: vi.fn(),
    reverse: vi.fn(),
    updateCorrection: (...args: unknown[]) => updateCorrection(...args),
  },
}));

vi.mock('@/lib/locale-format', () => ({
  formatFleetCurrency: (amount: number, currency = 'EUR') => `${amount} ${currency}`,
  formatFleetDate: (value: string) => value,
  formatFleetDateTime: (value: string) => value,
}));

import type { FuelReceiptReviewDetail } from '@/lib/types';
import { FuelReceiptReviewDrawer } from './FuelReceiptReviewDrawer';

function detail(overrides: Record<string, unknown> = {}): FuelReceiptReviewDetail {
  return {
    id: 'r-1',
    workflowStatus: 'approved',
    effectiveAccountingStatus: 'approved_effective',
    reversal: null,
    correctionOf: null,
    vehicle: { id: 'v-1', plateNumber: 'DU-AB 123' },
    driver: { id: 'd-1', name: 'İlker Çukur' },
    fuelingIntent: null,
    stationName: 'Aral Duisburg',
    stationAddress: null,
    receiptNumber: null,
    purchasedAt: '2026-05-13T08:42:00.000Z',
    fuelProduct: 'DIESEL',
    liters: 62.35,
    pricePerLiter: 1.719,
    fuelGrossAmount: 107.18,
    receiptGrossAmount: 107.18,
    receiptNetAmount: null,
    receiptVatAmount: null,
    receiptVatRate: null,
    currency: 'EUR',
    paymentMethod: null,
    odometerKm: null,
    receiptPlateNumber: null,
    isFullTank: false,
    mixedReceipt: false,
    compatibilityMismatch: false,
    duplicateSuspected: false,
    issues: [],
    ocr: {
      status: 'succeeded',
      provider: 'mock',
      processedAt: null,
      errorClass: null,
      dataMode: 'mock',
      extraction: null,
      lowConfidenceFields: [],
      lowConfidenceThreshold: 0.7,
    },
    fileDownloadPath: '/fleet/fuel-receipts/r-1/file',
    fileName: 'beleg.jpg',
    mimeType: 'image/jpeg',
    timeline: {
      uploadedAt: '2026-05-13T11:59:00.000Z',
      ocrProcessedAt: null,
      submittedAt: '2026-05-14T09:00:00.000Z',
      resubmittedAt: null,
      reviewedAt: '2026-08-14T09:00:00.000Z',
      rejectedAt: null,
    },
    review: { reviewedBy: null, accountingNote: null, rejectionReason: null },
    updatedAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  } as unknown as FuelReceiptReviewDetail;
}

const REVERSAL = {
  id: 'rev-1',
  reasonCode: 'incorrect_amount' as const,
  reason: 'Tutar yanlis onaylandi.',
  reversedAt: '2026-08-17T10:00:00.000Z',
  reversedBy: { id: 'acc-1', name: 'Buchhalter' },
  replacementEntryId: 'repl-1',
};

beforeEach(() => {
  detailFn.mockReset();
  updateCorrection.mockReset();
  updateCorrection.mockResolvedValue({ receipt: detail() });
});

async function open(row: FuelReceiptReviewDetail, onOpenReceipt = vi.fn()) {
  detailFn.mockResolvedValue(row);
  render(
    <FuelReceiptReviewDrawer
      receiptId={row.id}
      onClose={vi.fn()}
      onReviewed={vi.fn()}
      onOpenReceipt={onOpenReceipt}
    />,
  );
  await screen.findByTestId('effective-status');
  return { onOpenReceipt };
}

describe('inceleme cekmecesi — ters kayit', () => {
  it('etkili onayli fiste ters kayit dugmesi GORUNUR', async () => {
    await open(detail());
    expect(screen.getByTestId('open-reversal')).toBeTruthy();
  });

  it('ZATEN ters kayda alinmis fiste dugme GORUNMEZ', async () => {
    await open(detail({ effectiveAccountingStatus: 'reversed', reversal: REVERSAL }));
    expect(screen.queryByTestId('open-reversal')).toBeNull();
  });

  it('onay bekleyen fiste ters kayit dugmesi GORUNMEZ', async () => {
    await open(detail({ workflowStatus: 'submitted', effectiveAccountingStatus: 'submitted' }));
    expect(screen.queryByTestId('open-reversal')).toBeNull();
  });

  it('ters kayda alinmis fis MALIYET DISI olarak isaretlenir', async () => {
    await open(detail({ effectiveAccountingStatus: 'reversed', reversal: REVERSAL }));
    expect(screen.getByTestId('cost-note').textContent).toContain(
      'costs.fuelReceipts.reversal.notInTotals',
    );
  });

  it('onayli fiste maliyet disi aciklamasi CIKMAZ', async () => {
    await open(detail());
    expect(screen.queryByTestId('cost-note')).toBeNull();
  });

  it('ters kayit ayrintisi sebep, tarih ve kisiyi gosterir', async () => {
    await open(detail({ effectiveAccountingStatus: 'reversed', reversal: REVERSAL }));
    const box = screen.getByTestId('reversal-details');
    expect(box.textContent).toContain('costs.fuelReceipts.reversal.reason.incorrect_amount');
    expect(box.textContent).toContain('Tutar yanlis onaylandi.');
    expect(box.textContent).toContain('Buchhalter');
  });

  it('duzeltilmis kayda gecis calisir', async () => {
    const { onOpenReceipt } = await open(
      detail({ effectiveAccountingStatus: 'reversed', reversal: REVERSAL }),
    );
    await userEvent.click(screen.getByTestId('open-replacement'));
    expect(onOpenReceipt).toHaveBeenCalledWith('repl-1');
  });

  it('duzeltilmis kayittan ORIJINALE donus calisir', async () => {
    const { onOpenReceipt } = await open(
      detail({
        id: 'repl-1',
        workflowStatus: 'submitted',
        effectiveAccountingStatus: 'submitted',
        correctionOf: {
          reversalId: 'rev-1',
          originalEntryId: 'r-1',
          reversedAt: '2026-08-17T10:00:00.000Z',
        },
      }),
    );
    await userEvent.click(screen.getByTestId('open-original'));
    expect(onOpenReceipt).toHaveBeenCalledWith('r-1');
  });

  it('duzeltme kaydinda DUZELTME FORMU cikar', async () => {
    await open(
      detail({
        id: 'repl-1',
        workflowStatus: 'submitted',
        effectiveAccountingStatus: 'submitted',
        correctionOf: { reversalId: 'rev-1', originalEntryId: 'r-1', reversedAt: '2026-08-17T10:00:00.000Z' },
      }),
    );
    expect(screen.getByTestId('correction-form')).toBeTruthy();
  });

  it('sıradan bir fiste duzeltme formu CIKMAZ', async () => {
    await open(detail({ workflowStatus: 'submitted', effectiveAccountingStatus: 'submitted' }));
    expect(screen.queryByTestId('correction-form')).toBeNull();
  });

  it('duzeltmeyi kaydetmek ONAYLAMAZ', async () => {
    await open(
      detail({
        id: 'repl-1',
        workflowStatus: 'submitted',
        effectiveAccountingStatus: 'submitted',
        correctionOf: { reversalId: 'rev-1', originalEntryId: 'r-1', reversedAt: '2026-08-17T10:00:00.000Z' },
      }),
    );
    // Ekranda ACIKCA yaziyor.
    expect(screen.getByTestId('correction-no-auto-approve').textContent).toContain(
      'costs.fuelReceipts.correction.noAutoApprove',
    );

    await userEvent.click(screen.getByTestId('correction-save'));
    await waitFor(() => expect(updateCorrection).toHaveBeenCalledTimes(1));
    // Kaydetme istegi onay ucuna DEGIL, duzeltme ucuna gidiyor.
    expect(updateCorrection.mock.calls[0][0]).toBe('repl-1');
    expect(await screen.findByTestId('correction-saved')).toBeTruthy();
  });

  it('duzeltme kaydetme hatasinda HAM KOD sizmaz', async () => {
    updateCorrection.mockRejectedValue({ response: { data: { code: 'db_exploded' } } });
    await open(
      detail({
        id: 'repl-1',
        workflowStatus: 'submitted',
        effectiveAccountingStatus: 'submitted',
        correctionOf: { reversalId: 'rev-1', originalEntryId: 'r-1', reversedAt: '2026-08-17T10:00:00.000Z' },
      }),
    );
    await userEvent.click(screen.getByTestId('correction-save'));
    const error = await screen.findByTestId('correction-error');
    expect(error.textContent).not.toContain('db_exploded');
  });

  it('ters kayit modali dugmeden acilir', async () => {
    await open(detail());
    await userEvent.click(screen.getByTestId('open-reversal'));
    expect(await screen.findByTestId('reversal-dialog')).toBeTruthy();
  });
});
