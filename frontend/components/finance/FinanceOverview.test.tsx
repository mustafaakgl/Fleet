import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Finance merkezi (Faz 18C).
 *
 * Backend MOCK. Sinanan sey grafik pikselleri degil ekranin verdigi BILGI:
 * tahmin ile gerceklesenin ayri kalmasi, `0` ile "veri yok" ayrimi, karar
 * panelinin ret nedeni olmadan gecmemesi ve yetkisiz rolun ekrani hic
 * gormemesi.
 */

const getSummary = vi.fn();
const reviewFn = vi.fn();
const getUserFn = vi.fn();

vi.mock('@/lib/locale-format', () => ({
  formatFleetCurrency: (amount: number, currency = 'EUR') => `${amount} ${currency}`,
  formatFleetDate: (value: string) => value,
  formatFleetDateTime: (value: string) => value,
}));

vi.mock('@/lib/api', () => ({
  financeApi: { getSummary: (...args: unknown[]) => getSummary(...args) },
  serviceRecordsApi: { review: (...args: unknown[]) => reviewFn(...args) },
}));

vi.mock('@/lib/auth', () => ({
  getUser: () => getUserFn(),
}));

import type { FinanceSummaryResponse } from '@/lib/types';
import { FinanceOverview } from './FinanceOverview';

function serviceItem(over: Record<string, unknown> = {}) {
  return {
    id: 'sr-1',
    date: '2026-06-10T00:00:00.000Z',
    vehicleId: 'v-1',
    vehiclePlate: 'DU-AB 123',
    serviceType: 'Bremsen',
    repairCompany: 'Werkstatt Nord',
    amount: '250.00',
    currency: 'EUR',
    inBaseCurrency: true,
    ...over,
  };
}

function summary(over: Partial<FinanceSummaryResponse> = {}): FinanceSummaryResponse {
  return {
    baseCurrency: 'EUR',
    period: {
      from: '2026-03-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
      timezone: 'Europe/Berlin',
    },
    revenue: {
      actual: { amount: '12000.00', count: 8 },
      estimated: { amount: '15000.00', count: 40 },
    },
    cost: {
      fuel: { amount: '4000.00', count: 30 },
      service: { amount: '2500.00', count: 6 },
      fines: { amount: '300.00', count: 3 },
      total: { amount: '6800.00', count: 39 },
    },
    margin: '5200.00',
    pendingServiceRecords: {
      totalAmount: '250.00',
      totalCount: 1,
      items: [serviceItem()],
    },
    fuelReceipts: {
      totalAmount: '95.40',
      totalCount: 1,
      items: [
        {
          id: 'fr-1',
          enteredAt: '2026-06-12T00:00:00.000Z',
          vehicleId: 'v-1',
          vehiclePlate: 'DU-AB 123',
          stationName: 'Aral Duisburg',
          amount: '95.40',
          currency: 'EUR',
          workflowStatus: 'submitted' as const,
        },
      ],
    },
    disputedFines: {
      totalAmount: '320.00',
      totalCount: 1,
      items: [
        {
          id: 'fn-1',
          violationAt: '2026-06-14T00:00:00.000Z',
          vehicleId: 'v-1',
          vehiclePlate: 'DU-AB 123',
          violationType: 'Geschwindigkeit',
          amount: '320.00',
          currency: 'EUR',
          inBaseCurrency: true,
        },
      ],
    },
    unconvertedByCurrency: [],
    ...over,
  };
}

async function renderFinance(data = summary(), role = 'accounting') {
  getUserFn.mockReturnValue({ id: 'u1', email: 'a@b.c', role, name: 'A' });
  getSummary.mockResolvedValue(data);
  render(<FinanceOverview />);
  await screen.findByTestId('finance-overview');
  await waitFor(() => expect(getSummary).toHaveBeenCalled());
  return data;
}

beforeEach(() => {
  getSummary.mockReset();
  reviewFn.mockReset();
  getUserFn.mockReset();
});

describe('finance merkezi — yetki', () => {
  it('office ekrani GORMEZ ve veri ISTEMEZ', async () => {
    getUserFn.mockReturnValue({ id: 'u1', email: 'o@b.c', role: 'office', name: 'O' });
    render(<FinanceOverview />);
    await screen.findByText('finance.forbiddenTitle');
    // Istemcide gizlemek yetmez; istek hic ATILMIYOR ve sunucudaki
    // @Roles(...FINANCIAL_ROLES) zaten cevabi vermezdi.
    expect(getSummary).not.toHaveBeenCalled();
  });

  it('driver da GORMEZ', async () => {
    getUserFn.mockReturnValue({ id: 'u2', email: 'd@b.c', role: 'driver', name: 'D' });
    render(<FinanceOverview />);
    await screen.findByText('finance.forbiddenTitle');
    expect(getSummary).not.toHaveBeenCalled();
  });

  it('accounting, admin ve boss gorur', async () => {
    for (const role of ['accounting', 'admin', 'boss']) {
      // Her rol icin TEMIZ bir DOM: aksi halde onceki render ekranda kalir
      // ve sorgu birden fazla eslesme bulur.
      cleanup();
      getSummary.mockReset();
      await renderFinance(summary(), role);
      expect(getSummary).toHaveBeenCalled();
    }
  });
});

describe('finance merkezi — tahmin ve gercek AYRI', () => {
  it('gelir TEK kartta degil, iki ayri kartta', async () => {
    await renderFinance();
    expect(screen.getByTestId('finance-kpi-actualRevenue')).toBeTruthy();
    expect(screen.getByTestId('finance-kpi-estimatedRevenue')).toBeTruthy();
  });

  it('kartlar sinifi METIN olarak yazar', async () => {
    await renderFinance();
    expect(screen.getByTestId('finance-kpi-actualRevenue').textContent).toContain(
      'finance.basis.actual',
    );
    expect(screen.getByTestId('finance-kpi-estimatedRevenue').textContent).toContain(
      'finance.basis.estimated',
    );
  });

  it('iki rakam hicbir yerde TOPLANMAZ', async () => {
    await renderFinance();
    const actual = screen.getByTestId('finance-kpi-actualRevenue').textContent!;
    const estimated = screen.getByTestId('finance-kpi-estimatedRevenue').textContent!;
    expect(actual).toContain('12000');
    expect(estimated).toContain('15000');
    // 27.000 hicbir kartta gorunmemeli.
    expect(document.body.textContent).not.toContain('27000');
  });
});

describe('finance merkezi — 0 ile "veri yok" ayrimi', () => {
  it('fatura yoksa gercek gelir "veri yok" der, 0,00 DEMEZ', async () => {
    await renderFinance(
      summary({
        revenue: { actual: null, estimated: { amount: '15000.00', count: 40 } },
        margin: null,
      }),
    );
    const card = screen.getByTestId('finance-kpi-actualRevenue');
    expect(card.textContent).toContain('finance.noData');
    expect(card.textContent).not.toContain('0 EUR');
    expect(screen.getByTestId('finance-kpi-margin').textContent).toContain('finance.noData');
  });

  it('OLCULMUS sifir bir degerdir ve gosterilir', async () => {
    await renderFinance(
      summary({
        cost: {
          fuel: { amount: '0.00', count: 5 },
          service: { amount: '0.00', count: 0 },
          fines: { amount: '0.00', count: 0 },
          total: { amount: '0.00', count: 5 },
        },
      }),
    );
    // Bes kayit var, toplami sifir: gercek bir olcum, gosteriliyor.
    expect(screen.getByTestId('finance-kpi-approvedCost').textContent).toContain('0 EUR');
  });
});

describe('finance merkezi — bolumler', () => {
  it('yedi blogun hepsi TEK ekranda', async () => {
    await renderFinance();
    expect(screen.getByTestId('finance-kpi-actualRevenue')).toBeTruthy();
    expect(screen.getByTestId('finance-kpi-estimatedRevenue')).toBeTruthy();
    expect(screen.getByTestId('finance-kpi-approvedCost')).toBeTruthy();
    expect(screen.getByTestId('finance-pending-service')).toBeTruthy();
    expect(screen.getByTestId('finance-fuel-receipts')).toBeTruthy();
    expect(screen.getByTestId('finance-disputed-fines')).toBeTruthy();
    expect(screen.getByText('finance.unconverted.title')).toBeTruthy();
  });

  it('ihtilafli cezalar AYRI bolumde', async () => {
    await renderFinance();
    const section = screen.getByTestId('finance-disputed-fines');
    expect(section.textContent).toContain('finance.disputedFines.title');
    expect(section.textContent).toContain('320');
    // Onayli gider kartina karismiyor: 6.800 icinde 320 yok.
    expect(screen.getByTestId('finance-kpi-approvedCost').textContent).toContain('6800');
  });

  it('yakit fisi MEVCUT fis detayina baglaniyor — yeni sayfa YOK', async () => {
    await renderFinance();
    const section = screen.getByTestId('finance-fuel-receipts');
    const link = within(section).getAllByRole('link')[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/costs?tab=receipts&receipt=fr-1');
  });

  it('satis faturalari butonu MEVCUT /invoicing ekranina gider', async () => {
    await renderFinance();
    const link = screen
      .getAllByRole('link')
      .find((node) => node.textContent?.includes('finance.openInvoicing'));
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/invoicing');
  });

  it('kirpma SESSIZ degil', async () => {
    await renderFinance(
      summary({
        pendingServiceRecords: { totalAmount: '250.00', totalCount: 180, items: [serviceItem()] },
      }),
    );
    expect(screen.getByTestId('finance-pending-service').textContent).toContain(
      'finance.truncated',
    );
  });
});

describe('finance merkezi — inceleme paneli', () => {
  it('bekleyen kayda basinca panel acilir', async () => {
    await renderFinance();
    const section = screen.getByTestId('finance-pending-service');
    await userEvent.click(within(section).getAllByRole('button')[0]);
    expect(await screen.findByTestId('service-review-drawer')).toBeTruthy();
  });

  it('onay verince uc cagrilir ve ozet YENIDEN okunur', async () => {
    await renderFinance();
    await userEvent.click(
      within(screen.getByTestId('finance-pending-service')).getAllByRole('button')[0],
    );
    const drawer = await screen.findByTestId('service-review-drawer');
    reviewFn.mockResolvedValue({});

    await userEvent.click(
      within(drawer)
        .getAllByRole('button')
        .find((node) => node.textContent?.includes('finance.review.approve'))!,
    );

    await waitFor(() => expect(reviewFn).toHaveBeenCalledWith('sr-1', { decision: 'approve', reason: undefined }));
    // Toplamlar ile kuyruk istemcide ayri ayri guncellenirse birbirini
    // tutmaz: tek kaynak yeniden okunuyor.
    await waitFor(() => expect(getSummary).toHaveBeenCalledTimes(2));
  });

  it('RET NEDENI olmadan reddedilemez', async () => {
    await renderFinance();
    await userEvent.click(
      within(screen.getByTestId('finance-pending-service')).getAllByRole('button')[0],
    );
    const drawer = await screen.findByTestId('service-review-drawer');

    await userEvent.click(
      within(drawer)
        .getAllByRole('button')
        .find((node) => node.textContent?.includes('finance.review.reject'))!,
    );

    const confirm = within(drawer)
      .getAllByRole('button')
      .find((node) => node.textContent?.includes('finance.review.confirmReject'))!;
    // Buton KAPALI: kullanici 400 yemeden once eksigi goruyor.
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(reviewFn).not.toHaveBeenCalled();

    await userEvent.type(
      within(drawer).getByLabelText('finance.review.reasonLabel'),
      'Belege fehlen komplett',
    );
    reviewFn.mockResolvedValue({});
    await userEvent.click(
      within(drawer)
        .getAllByRole('button')
        .find((node) => node.textContent?.includes('finance.review.confirmReject'))!,
    );
    await waitFor(() =>
      expect(reviewFn).toHaveBeenCalledWith('sr-1', {
        decision: 'reject',
        reason: 'Belege fehlen komplett',
      }),
    );
  });

  it('temel para birimi disindaki tutar icin UYARI gosterir', async () => {
    await renderFinance(
      summary({
        pendingServiceRecords: {
          totalAmount: '0.00',
          totalCount: 1,
          items: [serviceItem({ currency: 'TRY', inBaseCurrency: false })],
        },
      }),
    );
    await userEvent.click(
      within(screen.getByTestId('finance-pending-service')).getAllByRole('button')[0],
    );
    const drawer = await screen.findByTestId('service-review-drawer');
    // Onaylansa bile toplama girmeyecek: karar verilmeden ONCE soyleniyor.
    expect(drawer.textContent).toContain('finance.review.foreignCurrency');
  });

  it('gider detayi TEKRARLANMIYOR, mevcut kayda baglaniyor', async () => {
    await renderFinance();
    await userEvent.click(
      within(screen.getByTestId('finance-pending-service')).getAllByRole('button')[0],
    );
    const drawer = await screen.findByTestId('service-review-drawer');
    const link = within(drawer)
      .getAllByRole('link')
      .find((node) => node.textContent?.includes('finance.review.openRecord'));
    expect((link as HTMLAnchorElement).getAttribute('href')).toBe('/service-history/sr-1');
  });
});
