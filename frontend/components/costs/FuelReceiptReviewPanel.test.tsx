import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Muhasebe yakit fisi inceleme ekrani.
 *
 * Backend MOCK: gercek uca cagri yok. Sinanan sey kuyruk davranisi, onay/ret
 * akisi, cakisma sonrasi yeniden yukleme ve ham hata kodunun sizmamasi.
 */

const listFn = vi.fn();
const detailFn = vi.fn();
const approveFn = vi.fn();
const rejectFn = vi.fn();

/**
 * `locale-format` i18n istemcisini zincirle iceri cekiyor; testte para
 * bicimlendirmesi sinanmiyor, yalnizca DEGERIN gorunmesi onemli.
 */
vi.mock('@/lib/locale-format', () => ({
  formatFleetCurrency: (amount: number, currency = 'EUR') => `${amount} ${currency}`,
  formatFleetDateTime: (value: string) => value,
  formatFleetDate: (value: string) => value,
}));

vi.mock('@/lib/api', () => ({
  fuelReceiptReviewApi: {
    list: (...args: unknown[]) => listFn(...args),
    detail: (...args: unknown[]) => detailFn(...args),
    approve: (...args: unknown[]) => approveFn(...args),
    reject: (...args: unknown[]) => rejectFn(...args),
  },
  getApiErrorMessage: (_e: unknown, fallback: string) => fallback,
}));

import type { FuelReceiptQueueResponse, FuelReceiptReviewDetail } from '@/lib/types';
import { FuelReceiptReviewPanel } from './FuelReceiptReviewPanel';

const KEY = {
  review: 'costs.fuelReceipts.review',
  approve: 'costs.fuelReceipts.approve',
  reject: 'costs.fuelReceipts.reject',
  confirmReject: 'costs.fuelReceipts.confirmReject',
  conflict: 'costs.fuelReceipts.errors.conflict',
  pendingTab: 'costs.fuelReceipts.tabs.pending',
  approvedTab: 'costs.fuelReceipts.tabs.approved',
  emptyTitle: 'costs.fuelReceipts.emptyTitle',
};

function queueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r-1',
    workflowStatus: 'submitted' as const,
    vehicle: { id: 'v-1', plateNumber: 'DU-AB 123' },
    driver: { id: 'd-1', name: 'İlker Çukur' },
    stationName: 'Aral Duisburg',
    purchasedAt: '2026-08-13T08:42:00.000Z',
    fuelProduct: 'DIESEL' as const,
    liters: 62.35,
    fuelGrossAmount: 107.18,
    currency: 'EUR',
    submittedAt: '2026-08-14T09:00:00.000Z',
    waitingDays: 2,
    compatibilityMismatch: false,
    duplicateSuspected: false,
    ocrProblem: false,
    // Faz 9: etkili durum HER satirda geliyor.
    effectiveAccountingStatus: 'submitted' as const,
    isCorrection: false,
    updatedAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  };
}

function queue(overrides: Partial<FuelReceiptQueueResponse> = {}): FuelReceiptQueueResponse {
  return {
    rows: [queueRow()],
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
    summary: { pendingCount: 1, oldestWaitingDays: 2 },
    ...overrides,
  } as FuelReceiptQueueResponse;
}

function detail(overrides: Record<string, unknown> = {}): FuelReceiptReviewDetail {
  return {
    ...queueRow(),
    reversal: null,
    correctionOf: null,
    stationAddress: 'Hafenstraße 12',
    receiptNumber: 'RG-1',
    pricePerLiter: 1.719,
    receiptGrossAmount: 107.18,
    receiptNetAmount: null,
    receiptVatAmount: null,
    receiptVatRate: null,
    paymentMethod: 'Firmenkarte',
    odometerKm: null,
    receiptPlateNumber: null,
    isFullTank: false,
    mixedReceipt: false,
    fuelingIntent: null,
    issues: [],
    ocr: {
      status: 'succeeded',
      provider: 'mock',
      processedAt: '2026-08-13T12:00:00.000Z',
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
      uploadedAt: '2026-08-13T11:59:00.000Z',
      ocrProcessedAt: '2026-08-13T12:00:00.000Z',
      submittedAt: '2026-08-14T09:00:00.000Z',
      resubmittedAt: null,
      reviewedAt: null,
      rejectedAt: null,
    },
    review: { reviewedBy: null, accountingNote: null, rejectionReason: null },
    ...overrides,
  } as FuelReceiptReviewDetail;
}

beforeEach(() => {
  listFn.mockReset();
  detailFn.mockReset();
  approveFn.mockReset();
  rejectFn.mockReset();
  listFn.mockResolvedValue(queue());
  detailFn.mockResolvedValue(detail());
  approveFn.mockResolvedValue({ receipt: detail({ workflowStatus: 'approved' }), changed: true });
  rejectFn.mockResolvedValue({ receipt: detail({ workflowStatus: 'rejected' }), changed: true });
});

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(screen.getByTestId('receipt-row')).toBeDefined());
  await user.click(screen.getByRole('button', { name: KEY.review }));
  await waitFor(() => expect(screen.getByTestId('receipt-drawer')).toBeDefined());
}

describe('FuelReceiptReviewPanel — queue', () => {
  it('loads the pending queue by default', async () => {
    render(<FuelReceiptReviewPanel />);

    await waitFor(() => expect(listFn).toHaveBeenCalled());
    // Varsayilan gorunum BEKLEYENLER.
    expect(listFn.mock.calls[0]![0]).toMatchObject({ status: 'submitted', page: 1 });
    expect(screen.getByTestId('pending-count').textContent).toBe('1');
  });

  it('switches between the pending, approved and rejected filters', async () => {
    const user = userEvent.setup();
    render(<FuelReceiptReviewPanel />);
    await waitFor(() => expect(listFn).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: KEY.approvedTab }));

    await waitFor(() =>
      expect(listFn.mock.calls.at(-1)![0]).toMatchObject({ status: 'approved', page: 1 }),
    );
  });

  it('paginates on the server rather than in the browser', async () => {
    const user = userEvent.setup();
    listFn.mockResolvedValue(queue({ total: 60, totalPages: 3, page: 1 }));
    render(<FuelReceiptReviewPanel />);
    await waitFor(() => expect(screen.getByTestId('receipt-row')).toBeDefined());

    await user.click(screen.getByRole('button', { name: 'common.next' }));

    await waitFor(() => expect(listFn.mock.calls.at(-1)![0]).toMatchObject({ page: 2 }));
  });

  it('shows the duplicate, mismatch and ocr flags', async () => {
    listFn.mockResolvedValue(
      queue({
        rows: [queueRow({ compatibilityMismatch: true, duplicateSuspected: true, ocrProblem: true })],
      }),
    );
    render(<FuelReceiptReviewPanel />);

    const row = await screen.findByTestId('receipt-row');
    expect(within(row).getByText('costs.fuelReceipts.flagMismatchShort')).toBeDefined();
    expect(within(row).getByText('costs.fuelReceipts.flagDuplicateShort')).toBeDefined();
    expect(within(row).getByText('costs.fuelReceipts.flagOcrShort')).toBeDefined();
  });

  it('shows an empty state instead of a broken table', async () => {
    listFn.mockResolvedValue(queue({ rows: [], total: 0, summary: { pendingCount: 0, oldestWaitingDays: null } }));
    render(<FuelReceiptReviewPanel />);

    await waitFor(() => expect(screen.getByText(KEY.emptyTitle)).toBeDefined());
  });
});

describe('FuelReceiptReviewPanel — review drawer', () => {
  it('shows the receipt image through the authorised path, never a storage path', async () => {
    const user = userEvent.setup();
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    const image = screen.getByTestId('receipt-image') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe('/fleet/fuel-receipts/r-1/file');
    expect(document.body.innerHTML).not.toContain('/uploads/');
  });

  it('falls back to a link for a pdf receipt', async () => {
    const user = userEvent.setup();
    detailFn.mockResolvedValue(detail({ mimeType: 'application/pdf', fileName: 'beleg.pdf' }));
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    expect(screen.getByTestId('receipt-pdf-link')).toBeDefined();
    expect(screen.queryByTestId('receipt-image')).toBeNull();
  });

  it('compares the OCR reading with the value the driver confirmed', async () => {
    const user = userEvent.setup();
    detailFn.mockResolvedValue(
      detail({
        liters: 62.35,
        ocr: {
          status: 'succeeded',
          provider: 'mock',
          processedAt: null,
          errorClass: null,
          dataMode: 'mock',
          extraction: {
            stationName: { value: 'Aral Duisburg', confidence: 0.97 },
            receiptNumber: { value: 'RG-1', confidence: 0.9 },
            liters: { value: 48.9, confidence: 0.36 },
            pricePerLiter: { value: 1.719, confidence: 0.9 },
            fuelGrossAmount: { value: 107.18, confidence: 0.9 },
            receiptGrossAmount: { value: 107.18, confidence: 0.9 },
            hasNonFuelItems: false,
          },
          lowConfidenceFields: ['liters'],
          lowConfidenceThreshold: 0.7,
        },
      }),
    );
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    const table = screen.getByTestId('ocr-comparison');
    // OCR 48,9 okumus, surucu 62,35 onaylamis — fark GORUNMELI.
    expect(within(table).getByText('48.9')).toBeDefined();
    expect(within(table).getByText('62.35')).toBeDefined();
    expect(screen.getByTestId('flag-lowconf')).toBeDefined();
  });

  it('separates the fuel total from the receipt total on a mixed receipt', async () => {
    const user = userEvent.setup();
    detailFn.mockResolvedValue(
      detail({ mixedReceipt: true, fuelGrossAmount: 88.4, receiptGrossAmount: 95.6 }),
    );
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    expect(screen.getByTestId('flag-mixed')).toBeDefined();
    expect(screen.getByText('costs.fuelReceipts.mixedExplainer')).toBeDefined();
  });

  it('approves with the expectedUpdatedAt and refreshes the list', async () => {
    const user = userEvent.setup();
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    await user.click(screen.getByRole('button', { name: KEY.approve }));

    await waitFor(() => expect(approveFn).toHaveBeenCalled());
    // Optimistic concurrency: gordugumuz surum geri gonderiliyor.
    expect(approveFn.mock.calls[0]![1]).toMatchObject({
      expectedUpdatedAt: '2026-08-14T09:00:00.000Z',
    });
    // Onay sonrasi liste TAZELENIYOR: kapanan fis kuyrukta kalmamali.
    await waitFor(() => expect(listFn.mock.calls.length).toBeGreaterThan(1));
  });

  it('requires a reason before it lets the receipt go back', async () => {
    const user = userEvent.setup();
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    await user.click(screen.getByRole('button', { name: KEY.reject }));
    const confirm = screen.getByRole('button', { name: KEY.confirmReject });
    // Neden bos: gonderilemez.
    expect(confirm.hasAttribute('disabled')).toBe(true);

    await user.type(screen.getByLabelText('costs.fuelReceipts.reasonLabel'), 'Litre okunmuyor');
    expect(screen.getByRole('button', { name: KEY.confirmReject }).hasAttribute('disabled')).toBe(false);

    await user.click(screen.getByRole('button', { name: KEY.confirmReject }));
    await waitFor(() => expect(rejectFn).toHaveBeenCalled());
    expect(rejectFn.mock.calls[0]![1]).toMatchObject({ reason: 'Litre okunmuyor' });
  });

  it('prevents a double approve', async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => undefined;
    approveFn.mockImplementation(() => new Promise((resolve) => { release = resolve; }));

    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    const button = screen.getByRole('button', { name: KEY.approve });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(approveFn).toHaveBeenCalledTimes(1);
    release({ receipt: detail({ workflowStatus: 'approved' }), changed: true });
  });

  it('reloads the record after a conflict and shows a plain message', async () => {
    const user = userEvent.setup();
    approveFn.mockRejectedValue({
      response: { data: { code: 'fuel_receipt_review_conflict' } },
    });
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);
    const detailCallsBefore = detailFn.mock.calls.length;

    await user.click(screen.getByRole('button', { name: KEY.approve }));

    await waitFor(() => expect(screen.getByText(KEY.conflict)).toBeDefined());
    // Eski `updatedAt` ile ikinci deneme yine kaybederdi: kayit YENIDEN yuklendi.
    await waitFor(() => expect(detailFn.mock.calls.length).toBeGreaterThan(detailCallsBefore));
    // HAM KOD ekranda GORUNMEZ.
    expect(document.body.textContent).not.toContain('fuel_receipt_review_conflict');
  });

  it('offers no decision buttons on a receipt that is already closed', async () => {
    const user = userEvent.setup();
    detailFn.mockResolvedValue(detail({ workflowStatus: 'approved' }));
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    // `approved` IMMUTABLE: muhasebe sessizce yeniden duzenleyemez.
    expect(screen.queryByRole('button', { name: KEY.approve })).toBeNull();
    expect(screen.queryByRole('button', { name: KEY.reject })).toBeNull();
    expect(screen.getByTestId('review-closed')).toBeDefined();
  });

  it('shows the previous rejection reason and the timeline', async () => {
    const user = userEvent.setup();
    detailFn.mockResolvedValue(
      detail({
        review: { reviewedBy: null, accountingNote: null, rejectionReason: 'Litre okunmuyor' },
        timeline: {
          uploadedAt: '2026-08-13T11:59:00.000Z',
          ocrProcessedAt: null,
          submittedAt: '2026-08-14T09:00:00.000Z',
          resubmittedAt: '2026-08-15T10:00:00.000Z',
          reviewedAt: null,
          rejectedAt: '2026-08-15T08:00:00.000Z',
        },
      }),
    );
    render(<FuelReceiptReviewPanel />);
    await openDrawer(user);

    expect(screen.getByText(/costs\.fuelReceipts\.previousRejection/)).toBeDefined();
    expect(screen.getByTestId('review-timeline')).toBeDefined();
  });
});
