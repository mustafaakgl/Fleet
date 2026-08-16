import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Surucunun yakit fisi ekrani.
 *
 * Agdaki her uc mock: gercek OCR servisine ya da backend'e CAGRI YOK.
 * Sinanan sey akisin kendisi — yukleme, otomatik analiz, taslak doldurma,
 * dusuk guven isaretleri, elle devam ve onay.
 */

const uploadFuelReceipt = vi.fn();
const analyzeFuelReceipt = vi.fn();
const listFuelReceipts = vi.fn();
const confirmFuelReceipt = vi.fn();

vi.mock('@/lib/api', () => ({
  driverPortalApi: {
    uploadFuelReceipt: (...args: unknown[]) => uploadFuelReceipt(...args),
    analyzeFuelReceipt: (...args: unknown[]) => analyzeFuelReceipt(...args),
    listFuelReceipts: (...args: unknown[]) => listFuelReceipts(...args),
    confirmFuelReceipt: (...args: unknown[]) => confirmFuelReceipt(...args),
  },
  getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

import type { FuelReceipt, FuelReceiptExtraction } from '@/lib/types';
import { DriverFuelReceiptsScreen } from './DriverFuelReceiptsScreen';

const KEY = {
  capture: 'driverPortal.fuelReceipts.capture',
  choose: 'driverPortal.fuelReceipts.chooseFile',
  analyzing: 'driverPortal.fuelReceipts.analyzing',
  uploading: 'driverPortal.fuelReceipts.uploading',
  confirm: 'driverPortal.fuelReceipts.confirm',
  retry: 'driverPortal.fuelReceipts.retryAnalyze',
  lowConfidence: 'driverPortal.fuelReceipts.lowConfidence',
  awaiting: 'driverPortal.fuelReceipts.awaitingReview',
  mismatchAck: 'driverPortal.fuelReceipts.fuelMismatchAcknowledge',
  unreadable: 'driverPortal.fuelReceipts.ocr.unreadable',
  demo: 'driverPortal.fuelReceipts.demoBanner',
  mixedHint: 'driverPortal.fuelReceipts.mixedReceiptHint',
  unmapped: 'driverPortal.fuelReceipts.unmappedFuel',
};

function field<T>(value: T | null, confidence: number | null = 0.95) {
  return { value, confidence };
}

function extraction(overrides: Partial<FuelReceiptExtraction> = {}): FuelReceiptExtraction {
  return {
    stationName: field('Aral Duisburg Hafen'),
    stationAddress: field('Hafenstraße 12'),
    receiptNumber: field('RG-2026-884201'),
    purchasedAt: field('2026-08-13T08:42:00.000Z'),
    fuelProduct: field('DIESEL'),
    rawFuelLabel: null,
    liters: field(62.35),
    pricePerLiter: field(1.719),
    fuelGrossAmount: field(107.18),
    receiptGrossAmount: field(107.18),
    receiptNetAmount: field(90.07),
    receiptVatAmount: field(17.11),
    receiptVatRate: field(19),
    currency: field('EUR'),
    paymentMethod: field('Firmenkarte'),
    odometerKm: field(null, null),
    plateNumber: field('DU-AB 123'),
    hasNonFuelItems: false,
    ...overrides,
  } as FuelReceiptExtraction;
}

function receipt(overrides: Partial<FuelReceipt> = {}): FuelReceipt {
  return {
    id: 'r-1',
    workflowStatus: 'driver_review',
    ocrStatus: 'not_requested',
    ocrDataMode: null,
    ocrErrorClass: null,
    ocrExtraction: null,
    vehicle: { id: 'veh-1', plateNumber: 'DU-AB 123' },
    fuelingIntentId: null,
    fileDownloadPath: '/driver/fuel-receipts/r-1/file',
    fileName: 'beleg.jpg',
    mimeType: 'image/jpeg',
    enteredAt: '2026-08-13T12:00:00.000Z',
    purchasedAt: null,
    stationName: null,
    stationAddress: null,
    receiptNumber: null,
    fuelProduct: null,
    liters: null,
    pricePerLiter: null,
    fuelGrossAmount: null,
    receiptGrossAmount: null,
    receiptNetAmount: null,
    receiptVatAmount: null,
    receiptVatRate: null,
    currency: 'EUR',
    paymentMethod: null,
    odometerKm: null,
    receiptPlateNumber: null,
    isFullTank: false,
    compatibilityMismatch: false,
    submittedAt: null,
    rejectionReason: null,
    rejectedAt: null,
    createdAt: '2026-08-13T12:00:00.000Z',
    ...overrides,
  };
}

function jpeg(name = 'beleg.jpg'): File {
  return new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], name, { type: 'image/jpeg' });
}

beforeEach(() => {
  uploadFuelReceipt.mockReset();
  analyzeFuelReceipt.mockReset();
  listFuelReceipts.mockReset();
  confirmFuelReceipt.mockReset();
  listFuelReceipts.mockResolvedValue([]);
  uploadFuelReceipt.mockResolvedValue(receipt());
  analyzeFuelReceipt.mockResolvedValue(
    receipt({ ocrStatus: 'succeeded', ocrDataMode: 'mock', ocrExtraction: extraction() }),
  );
  // jsdom object URL uretmiyor.
  Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:preview', writable: true });
  Object.defineProperty(URL, 'revokeObjectURL', { value: () => undefined, writable: true });
});

async function uploadFile(user: ReturnType<typeof userEvent.setup>, file = jpeg()) {
  const input = screen.getByTestId('receipt-file-input') as HTMLInputElement;
  await user.upload(input, file);
}

describe('DriverFuelReceiptsScreen — independent upload', () => {
  it('offers the upload action with no tour and no fueling intent', () => {
    render(<DriverFuelReceiptsScreen />);

    expect(screen.getByRole('button', { name: KEY.capture })).toBeDefined();
    expect(screen.getByRole('button', { name: KEY.choose })).toBeDefined();
    // Aktif tur ya da yakit duragi SORULMUYOR.
    expect(uploadFuelReceipt).not.toHaveBeenCalled();
  });

  it('uploads without a fueling intent id', async () => {
    const user = userEvent.setup();
    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(uploadFuelReceipt).toHaveBeenCalled());
    expect(uploadFuelReceipt.mock.calls[0]![1]).toBeUndefined();
  });

  it('passes the fueling intent id when the screen was opened from the stop card', async () => {
    const user = userEvent.setup();
    render(<DriverFuelReceiptsScreen fuelingIntentId="intent-1" />);
    await uploadFile(user);

    await waitFor(() => expect(uploadFuelReceipt).toHaveBeenCalled());
    expect(uploadFuelReceipt.mock.calls[0]![1]).toBe('intent-1');
  });

  it('offers both camera and file pickers restricted to the supported types', () => {
    render(<DriverFuelReceiptsScreen />);

    const camera = screen.getByTestId('receipt-camera-input');
    const file = screen.getByTestId('receipt-file-input');
    expect(camera.getAttribute('capture')).toBe('environment');
    expect(file.getAttribute('accept')).toBe('image/jpeg,image/png,application/pdf');
  });

  it('shows a preview of the chosen file', async () => {
    const user = userEvent.setup();
    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(screen.getByTestId('receipt-preview')).toBeDefined());
  });
});

describe('DriverFuelReceiptsScreen — OCR flow', () => {
  it('starts the analysis automatically and shows progress', async () => {
    const user = userEvent.setup();
    let resolveAnalyze: (value: FuelReceipt) => void = () => undefined;
    analyzeFuelReceipt.mockImplementation(
      () => new Promise<FuelReceipt>((resolve) => { resolveAnalyze = resolve; }),
    );

    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(screen.getByTestId('receipt-progress')).toBeDefined());
    expect(screen.getByText(KEY.analyzing)).toBeDefined();

    resolveAnalyze(receipt({ ocrStatus: 'succeeded', ocrExtraction: extraction() }));
    await waitFor(() => expect(screen.queryByTestId('receipt-progress')).toBeNull());
  });

  it('prefills the form from the extraction', async () => {
    const user = userEvent.setup();
    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(screen.getByTestId('receipt-form')).toBeDefined());
    expect((screen.getByLabelText(/driverPortal\.fuelReceipts\.stationName/) as HTMLInputElement).value)
      .toBe('Aral Duisburg Hafen');
    expect((screen.getByLabelText(/driverPortal\.fuelReceipts\.liters/) as HTMLInputElement).value)
      .toBe('62.35');
    // Arac SUNUCUDAN ve salt okunur.
    expect(screen.getByText('DU-AB 123')).toBeDefined();
  });

  it('marks low-confidence fields', async () => {
    const user = userEvent.setup();
    analyzeFuelReceipt.mockResolvedValue(
      receipt({
        ocrStatus: 'succeeded',
        ocrExtraction: extraction({ liters: field(48.9, 0.36), stationName: field('ESSO', 0.41) }),
      }),
    );

    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(screen.getByTestId('receipt-form')).toBeDefined());
    expect(screen.getAllByText(KEY.lowConfidence).length).toBeGreaterThanOrEqual(2);
    expect(
      screen.getByLabelText(/driverPortal\.fuelReceipts\.liters/).getAttribute('data-low-confidence'),
    ).toBe('true');
  });

  it('keeps the form usable and offers a retry after an OCR failure', async () => {
    const user = userEvent.setup();
    analyzeFuelReceipt.mockResolvedValue(
      receipt({ ocrStatus: 'failed', ocrErrorClass: 'unreadable' }),
    );

    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(screen.getByTestId('receipt-form')).toBeDefined());
    // Fis KAYBOLMADI: teknik olmayan metin + elle doldurma + tekrar deneme.
    expect(screen.getByText(KEY.unreadable)).toBeDefined();
    expect(screen.getByRole('button', { name: KEY.retry })).toBeDefined();

    analyzeFuelReceipt.mockResolvedValue(
      receipt({ ocrStatus: 'succeeded', ocrExtraction: extraction() }),
    );
    await user.click(screen.getByRole('button', { name: KEY.retry }));
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/driverPortal\.fuelReceipts\.stationName/) as HTMLInputElement).value,
      ).toBe('Aral Duisburg Hafen'),
    );
  });

  it('marks demo data from the server field, not from a client env flag', async () => {
    const user = userEvent.setup();
    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(screen.getByText(KEY.demo)).toBeDefined());
  });

  it('asks the driver to pick a fuel it could not map', async () => {
    const user = userEvent.setup();
    analyzeFuelReceipt.mockResolvedValue(
      receipt({
        ocrStatus: 'succeeded',
        ocrExtraction: extraction({ fuelProduct: field(null, null), rawFuelLabel: 'SUPER' }),
      }),
    );

    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(screen.getByText(/driverPortal\.fuelReceipts\.unmappedFuel/)).toBeDefined());
    // Tahmin edilmedi: secim bos.
    expect((screen.getByLabelText(/driverPortal\.fuelReceipts\.fuelProduct/) as HTMLSelectElement).value).toBe('');
  });

  it('explains the split on a mixed receipt', async () => {
    const user = userEvent.setup();
    analyzeFuelReceipt.mockResolvedValue(
      receipt({
        ocrStatus: 'succeeded',
        ocrExtraction: extraction({
          fuelGrossAmount: field(88.4),
          receiptGrossAmount: field(95.6),
          hasNonFuelItems: true,
        }),
      }),
    );

    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(screen.getByText(KEY.mixedHint)).toBeDefined());
    expect((screen.getByLabelText(/fuelGrossAmount|driverPortal\.fuelReceipts\.fuelGrossAmount/) as HTMLInputElement).value).toBe('88.4');
    expect((screen.getByLabelText(/driverPortal\.fuelReceipts\.receiptGrossAmount/) as HTMLInputElement).value).toBe('95.6');
  });
});

describe('DriverFuelReceiptsScreen — confirmation', () => {
  async function reachForm(user: ReturnType<typeof userEvent.setup>) {
    render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);
    await waitFor(() => expect(screen.getByTestId('receipt-form')).toBeDefined());
  }

  it('shows a readable summary before confirming', async () => {
    const user = userEvent.setup();
    await reachForm(user);

    const summary = screen.getByTestId('receipt-summary');
    expect(within(summary).getByText(/driverPortal\.fuelReceipts\.summaryLine/)).toBeDefined();
  });

  it('submits and shows the awaiting-review state', async () => {
    const user = userEvent.setup();
    confirmFuelReceipt.mockResolvedValue({
      receipt: receipt({ workflowStatus: 'submitted', stationName: 'Aral Duisburg Hafen' }),
      issues: [],
    });
    await reachForm(user);

    await user.click(screen.getByRole('button', { name: KEY.confirm }));

    await waitFor(() => expect(screen.getByTestId('receipt-submitted')).toBeDefined());
    expect(screen.getByText(KEY.awaiting)).toBeDefined();
  });

  it('prevents a double submit', async () => {
    const user = userEvent.setup();
    let resolveConfirm: (value: unknown) => void = () => undefined;
    confirmFuelReceipt.mockImplementation(
      () => new Promise((resolve) => { resolveConfirm = resolve; }),
    );
    await reachForm(user);

    const button = screen.getByRole('button', { name: KEY.confirm });
    await user.click(button);
    await user.click(button);
    await user.click(button);

    expect(confirmFuelReceipt).toHaveBeenCalledTimes(1);
    resolveConfirm({ receipt: receipt({ workflowStatus: 'submitted' }), issues: [] });
  });

  it('shows math warnings without blocking the submit', async () => {
    const user = userEvent.setup();
    analyzeFuelReceipt.mockResolvedValue(
      receipt({
        ocrStatus: 'succeeded',
        ocrExtraction: extraction({ fuelGrossAmount: field(90), liters: field(50), pricePerLiter: field(1.7) }),
      }),
    );
    await reachForm(user);

    expect(screen.getByTestId('receipt-warnings')).toBeDefined();
    // UYARI, ENGEL DEGIL.
    expect(screen.getByRole('button', { name: KEY.confirm }).hasAttribute('disabled')).toBe(false);
  });

  it('demands an explicit acknowledgement for an incompatible fuel', async () => {
    const user = userEvent.setup();
    confirmFuelReceipt.mockRejectedValueOnce({
      response: { data: { code: 'fuel_product_not_compatible' } },
    });
    await reachForm(user);

    await user.click(screen.getByRole('button', { name: KEY.confirm }));

    // Kayit YOK EDILMIYOR: acik onay isteniyor.
    await waitFor(() => expect(screen.getByTestId('receipt-mismatch')).toBeDefined());
    expect(screen.getByRole('button', { name: KEY.confirm }).hasAttribute('disabled')).toBe(true);

    confirmFuelReceipt.mockResolvedValue({
      receipt: receipt({ workflowStatus: 'submitted', compatibilityMismatch: true }),
      issues: [],
    });
    await user.click(screen.getByText(KEY.mismatchAck));
    await user.click(screen.getByRole('button', { name: KEY.confirm }));

    await waitFor(() => expect(confirmFuelReceipt).toHaveBeenCalledTimes(2));
    expect(
      (confirmFuelReceipt.mock.calls[1]![1] as { acknowledgeFuelMismatch?: boolean })
        .acknowledgeFuelMismatch,
    ).toBe(true);
  });

  it('never shows a raw backend code', async () => {
    const user = userEvent.setup();
    confirmFuelReceipt.mockRejectedValue({
      response: { data: { code: 'fuel_receipt_not_editable' } },
    });
    await reachForm(user);

    await user.click(screen.getByRole('button', { name: KEY.confirm }));

    await waitFor(() =>
      expect(screen.getByText('driverPortal.fuelReceipts.errors.notEditable')).toBeDefined(),
    );
    expect(document.body.textContent).not.toContain('fuel_receipt_not_editable');
  });

  it('aborts the in-flight request when the screen unmounts', async () => {
    const user = userEvent.setup();
    let uploadSignal: AbortSignal | undefined;
    uploadFuelReceipt.mockImplementation((_file: unknown, _intent: unknown, signal: AbortSignal) => {
      uploadSignal = signal;
      return new Promise(() => undefined); // hic cozulmuyor
    });

    const view = render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);

    await waitFor(() => expect(uploadSignal).toBeDefined());
    expect(uploadSignal!.aborted).toBe(false);

    view.unmount();

    // Ekrandan cikilinca bekleyen istek iptal ediliyor: geri donen bir cevap
    // artik var olmayan bir bilesenin state'ini yazmaya calismaz.
    expect(uploadSignal!.aborted).toBe(true);
  });

  it('ignores a response that is no longer the newest request', async () => {
    const user = userEvent.setup();
    // Yukleme cozuluyor ama ANALIZ askida: bu sirada bilesen yeni bir istek
    // sirasina geciyor ve gecikmis analiz cevabi yok sayilmali.
    let releaseAnalyze: (value: FuelReceipt) => void = () => undefined;
    analyzeFuelReceipt.mockImplementation(
      () => new Promise<FuelReceipt>((resolve) => { releaseAnalyze = resolve; }),
    );

    const { unmount } = render(<DriverFuelReceiptsScreen />);
    await uploadFile(user);
    await waitFor(() => expect(screen.getByTestId('receipt-progress')).toBeDefined());

    unmount();
    // Gecikmis cevap unmount'tan SONRA geliyor — React uyarisi ya da cokme
    // uretmemeli.
    releaseAnalyze(receipt({ ocrStatus: 'succeeded', ocrExtraction: extraction() }));
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

});

describe('DriverFuelReceiptsScreen — recent receipts', () => {
  it('lists the driver receipts with their status', async () => {
    listFuelReceipts.mockResolvedValue([
      receipt({ id: 'a', workflowStatus: 'submitted', stationName: 'Aral', fuelGrossAmount: 107.18 }),
      receipt({ id: 'b', workflowStatus: 'approved', stationName: 'Shell', fuelGrossAmount: 73.71 }),
    ]);

    render(<DriverFuelReceiptsScreen />);

    await waitFor(() => expect(screen.getByTestId('receipt-list')).toBeDefined());
    const list = screen.getByTestId('receipt-list');
    expect(within(list).getByText('driverPortal.fuelReceipts.status.submitted')).toBeDefined();
    expect(within(list).getByText('driverPortal.fuelReceipts.status.approved')).toBeDefined();
  });
});
