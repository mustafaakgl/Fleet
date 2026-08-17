import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Ters kayit modali — GERCEK render.
 *
 * Backend mock. Sinanan sey: dogru fisin ozetlendigi, zorunlu alanlarin
 * gercekten zorunlu oldugu, cift submit'in engellendigi, ham hata kodunun
 * sizmadigi ve hata halinde formun KORUNDUGU.
 */
const reverse = vi.fn();

vi.mock('@/lib/api', () => ({
  fuelReceiptReviewApi: {
    reverse: (...args: unknown[]) => reverse(...args),
  },
}));

vi.mock('@/lib/locale-format', () => ({
  formatFleetCurrency: (amount: number, currency = 'EUR') => `${amount} ${currency}`,
  formatFleetDate: (value: string) => value,
  formatFleetDateTime: (value: string) => value,
}));

import type { FuelReceiptReviewDetail } from '@/lib/types';
import { FuelReceiptReversalDialog } from './FuelReceiptReversalDialog';

function detail(overrides: Record<string, unknown> = {}): FuelReceiptReviewDetail {
  return {
    id: 'r-1',
    workflowStatus: 'approved',
    effectiveAccountingStatus: 'approved_effective',
    reversal: null,
    correctionOf: null,
    vehicle: { id: 'v-1', plateNumber: 'DU-AB 123' },
    driver: { id: 'd-1', name: 'İlker Çukur' },
    stationName: 'Aral Duisburg',
    purchasedAt: '2026-05-13T08:42:00.000Z',
    fuelProduct: 'DIESEL',
    liters: 62.35,
    fuelGrossAmount: 107.18,
    currency: 'EUR',
    updatedAt: '2026-08-14T09:00:00.000Z',
    ...overrides,
  } as unknown as FuelReceiptReviewDetail;
}

const VALID_REASON = 'Fisteki toplam tutar yanlis onaylandi.';

beforeEach(() => {
  reverse.mockReset();
  reverse.mockResolvedValue({ receipt: detail(), replacement: null });
});

describe('FuelReceiptReversalDialog', () => {
  it('modal olarak isaretlenir', () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    const dialog = screen.getByTestId('reversal-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('DOGRU fisin ozetini gosterir', () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    const summary = screen.getByTestId('reversal-summary');
    expect(summary.textContent).toContain('DU-AB 123');
    expect(summary.textContent).toContain('İlker Çukur');
    expect(summary.textContent).toContain('Aral Duisburg');
    expect(summary.textContent).toContain('107.18 EUR');
  });

  it('acilinca ilk alana odaklanir', async () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId('reversal-reason-code')),
    );
  });

  it('yedi sebep kodunu listeler', () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    const select = screen.getByTestId('reversal-reason-code');
    expect(within(select).getAllByRole('option')).toHaveLength(7);
  });

  it('aciklama ZORUNLU — bos gonderilemez', async () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.click(screen.getByTestId('reversal-submit'));
    expect(reverse).not.toHaveBeenCalled();
    expect(screen.getByTestId('reversal-reason-error')).toBeTruthy();
  });

  it('yalnizca bosluktan olusan aciklama kabul edilmez', async () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.type(screen.getByTestId('reversal-reason'), '            ');
    await userEvent.click(screen.getByTestId('reversal-submit'));
    expect(reverse).not.toHaveBeenCalled();
  });

  it('hata metni ALANLA ILISKILENDIRILIR', async () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.click(screen.getByTestId('reversal-submit'));
    const field = screen.getByTestId('reversal-reason');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(field.getAttribute('aria-describedby')).toBe('reversal-reason-error');
  });

  it('`other` secildiginde de aciklama zorunlu kalir', async () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.selectOptions(screen.getByTestId('reversal-reason-code'), 'other');
    await userEvent.click(screen.getByTestId('reversal-submit'));
    expect(reverse).not.toHaveBeenCalled();
    expect(screen.getByTestId('reversal-reason-error')).toBeTruthy();
  });

  it('gecerli aciklamayla ters kayit gonderir', async () => {
    const onReversed = vi.fn();
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={onReversed} />);
    await userEvent.type(screen.getByTestId('reversal-reason'), VALID_REASON);
    await userEvent.click(screen.getByTestId('reversal-submit'));

    await waitFor(() => expect(reverse).toHaveBeenCalledTimes(1));
    expect(reverse.mock.calls[0][1]).toMatchObject({
      expectedUpdatedAt: '2026-08-14T09:00:00.000Z',
      reasonCode: 'incorrect_amount',
      reason: VALID_REASON,
      createReplacement: false,
    });
    await waitFor(() => expect(onReversed).toHaveBeenCalled());
  });

  it('duzeltilmis kopya secilirse istege yansir', async () => {
    reverse.mockResolvedValue({ receipt: detail(), replacement: detail({ id: 'repl-1' }) });
    const onReversed = vi.fn();
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={onReversed} />);
    await userEvent.type(screen.getByTestId('reversal-reason'), VALID_REASON);
    await userEvent.click(screen.getByTestId('reversal-create-replacement'));
    await userEvent.click(screen.getByTestId('reversal-submit'));

    await waitFor(() => expect(reverse).toHaveBeenCalled());
    expect(reverse.mock.calls[0][1].createReplacement).toBe(true);
    await waitFor(() => expect(onReversed).toHaveBeenCalledWith('repl-1'));
  });

  it('duzeltilmis kopya secilince EK SONUC aciklamasi cikar', async () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    const before = screen.getByTestId('reversal-consequences').textContent ?? '';
    await userEvent.click(screen.getByTestId('reversal-create-replacement'));
    const after = screen.getByTestId('reversal-consequences').textContent ?? '';
    expect(after.length).toBeGreaterThan(before.length);
    expect(after).toContain('consequenceReplacementPending');
  });

  it('SONUCU acikca anlatir — silinmeyecegi, maliyetten cikacagi, geri alinamayacagi', () => {
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    const text = screen.getByTestId('reversal-consequences').textContent ?? '';
    expect(text).toContain('consequenceKept');
    expect(text).toContain('consequenceRemovedFromCosts');
    expect(text).toContain('consequenceIrreversible');
  });

  it('CIFT SUBMIT engellenir', async () => {
    let resolve: (value: unknown) => void = () => {};
    reverse.mockImplementation(() => new Promise((r) => { resolve = r; }));
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.type(screen.getByTestId('reversal-reason'), VALID_REASON);

    const button = screen.getByTestId('reversal-submit');
    await userEvent.click(button);
    await userEvent.click(button);
    await userEvent.click(button);

    expect(reverse).toHaveBeenCalledTimes(1);
    resolve({ receipt: detail(), replacement: null });
  });

  it('istek surerken dugme pasiflesir', async () => {
    reverse.mockImplementation(() => new Promise(() => {}));
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.type(screen.getByTestId('reversal-reason'), VALID_REASON);
    await userEvent.click(screen.getByTestId('reversal-submit'));
    await waitFor(() =>
      expect((screen.getByTestId('reversal-submit') as HTMLButtonElement).disabled).toBe(true),
    );
  });

  it('hata halinde form degerleri KORUNUR', async () => {
    reverse.mockRejectedValue({ response: { data: { code: 'fuel_receipt_already_reversed' } } });
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.selectOptions(screen.getByTestId('reversal-reason-code'), 'duplicate');
    await userEvent.type(screen.getByTestId('reversal-reason'), VALID_REASON);
    await userEvent.click(screen.getByTestId('reversal-create-replacement'));
    await userEvent.click(screen.getByTestId('reversal-submit'));

    await screen.findByTestId('reversal-error');
    expect((screen.getByTestId('reversal-reason') as HTMLTextAreaElement).value).toBe(VALID_REASON);
    expect((screen.getByTestId('reversal-reason-code') as HTMLSelectElement).value).toBe('duplicate');
    expect((screen.getByTestId('reversal-create-replacement') as HTMLInputElement).checked).toBe(true);
  });

  it('HAM backend kodu gosterilmez', async () => {
    reverse.mockRejectedValue({ response: { data: { code: 'internal_db_failure' } } });
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.type(screen.getByTestId('reversal-reason'), VALID_REASON);
    await userEvent.click(screen.getByTestId('reversal-submit'));

    const error = await screen.findByTestId('reversal-error');
    expect(error.textContent).not.toContain('internal_db_failure');
    expect(error.textContent).toContain('costs.fuelReceipts.reversal.errors.generic');
  });

  it('cakisma mesaji kullanici dilinde', async () => {
    reverse.mockRejectedValue({ response: { data: { code: 'fuel_receipt_reversal_conflict' } } });
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.type(screen.getByTestId('reversal-reason'), VALID_REASON);
    await userEvent.click(screen.getByTestId('reversal-submit'));
    expect((await screen.findByTestId('reversal-error')).textContent).toContain(
      'costs.fuelReceipts.reversal.errors.conflict',
    );
  });

  it('Escape ile kapanir', async () => {
    const onClose = vi.fn();
    render(<FuelReceiptReversalDialog detail={detail()} onClose={onClose} onReversed={vi.fn()} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('iptal dugmesi kapatir ama istek ATMAZ', async () => {
    const onClose = vi.fn();
    render(<FuelReceiptReversalDialog detail={detail()} onClose={onClose} onReversed={vi.fn()} />);
    await userEvent.click(screen.getByText('common.cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
  });

  it('ekran okuyucu icin islem durumu bildirilir', async () => {
    reverse.mockImplementation(() => new Promise(() => {}));
    render(<FuelReceiptReversalDialog detail={detail()} onClose={vi.fn()} onReversed={vi.fn()} />);
    await userEvent.type(screen.getByTestId('reversal-reason'), VALID_REASON);
    await userEvent.click(screen.getByTestId('reversal-submit'));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain(
        'costs.fuelReceipts.reversal.working',
      ),
    );
  });
});
